// Voice calls between a farmer and a supplier. Audio flows peer-to-peer over
// WebRTC in the browser; the backend only keeps the call log and relays
// signaling (SDP offers/answers and ICE candidates) over the SSE hub.

const { getDb } = require("../db/connection");
const { participantKey, publish, isOnline } = require("../realtime/hub");
const { getConversation, addSystemMessage, publishToConversation, otherSide } = require("./messages.service");
const { sendSms } = require("./sms.service");

const PARTICIPANT_TYPES = ["farmer", "supplier"];
const TRANSITIONS = {
  ringing: ["answered", "declined", "missed", "ended", "failed"],
  answered: ["ended", "failed"],
};

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function notFound(message) {
  const err = new Error(message);
  err.status = 404;
  return err;
}

function getCall(id) {
  const call = getDb().prepare("SELECT * FROM calls WHERE id = ?").get(id);
  if (!call) throw notFound("Call not found");
  return call;
}

function counterpartKey(conversation, type) {
  const other = otherSide(type);
  return participantKey(other, other === "farmer" ? conversation.farmer_id : conversation.supplier_id);
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}

async function notifyMissedCall(conversation, callerType) {
  const callerName = callerType === "farmer" ? conversation.farmer_name : conversation.supplier_name;
  const callerPhone = callerType === "farmer" ? conversation.farmer_phone : conversation.supplier_phone;
  const calleePhone = callerType === "farmer" ? conversation.supplier_phone : conversation.farmer_phone;
  addSystemMessage(conversation.id, `Missed voice call from ${callerName}`);
  if (calleePhone) {
    await sendSms({
      to: calleePhone,
      body: `[AgriConnect] Missed call from ${callerName}.${callerPhone ? ` Call back: ${callerPhone}` : " Open AgriConnect to call back."}`,
      farmer_id: conversation.farmer_id,
    });
  }
}

/**
 * Start ringing the other side. If they have no open AgriConnect tab, the
 * call is logged as missed straight away and they get an SMS instead.
 */
async function startCall({ conversation_id, caller_type }) {
  if (!PARTICIPANT_TYPES.includes(caller_type)) {
    throw badRequest(`caller_type must be one of ${PARTICIPANT_TYPES.join(", ")}`);
  }
  const conversation = getConversation(conversation_id);
  const db = getDb();
  const calleeKey = counterpartKey(conversation, caller_type);

  if (!isOnline(calleeKey)) {
    const result = db
      .prepare(
        "INSERT INTO calls (conversation_id, caller_type, status, ended_at) VALUES (?, ?, 'missed', datetime('now'))"
      )
      .run(conversation.id, caller_type);
    await notifyMissedCall(conversation, caller_type);
    return { call: getCall(result.lastInsertRowid), callee_online: false };
  }

  const result = db
    .prepare("INSERT INTO calls (conversation_id, caller_type) VALUES (?, ?)")
    .run(conversation.id, caller_type);
  const call = getCall(result.lastInsertRowid);

  publish(calleeKey, "call:incoming", {
    call,
    conversation_id: conversation.id,
    caller_type,
    caller_name: caller_type === "farmer" ? conversation.farmer_name : conversation.supplier_name,
  });
  return { call, callee_online: true };
}

async function updateCallStatus({ call_id, status }) {
  const call = getCall(call_id);
  const allowed = TRANSITIONS[call.status] || [];
  if (call.status === status) return call; // idempotent (both sides may hang up at once)
  if (!allowed.includes(status)) {
    throw badRequest(`Cannot move a ${call.status} call to ${status}`);
  }

  const db = getDb();
  if (status === "answered") {
    db.prepare("UPDATE calls SET status = 'answered', answered_at = datetime('now') WHERE id = ?").run(call.id);
  } else {
    db.prepare("UPDATE calls SET status = ?, ended_at = datetime('now') WHERE id = ?").run(status, call.id);
  }
  const updated = getCall(call.id);
  const conversation = getConversation(call.conversation_id);
  publishToConversation(conversation, "call:update", { call: updated });

  if (status === "ended" && updated.answered_at) {
    const seconds = db
      .prepare("SELECT CAST(ROUND((julianday(ended_at) - julianday(answered_at)) * 86400) AS INTEGER) AS s FROM calls WHERE id = ?")
      .get(call.id).s;
    addSystemMessage(conversation.id, `Voice call · ${formatDuration(Math.max(0, seconds))}`);
  } else if (status === "missed" || (status === "ended" && !updated.answered_at)) {
    await notifyMissedCall(conversation, call.caller_type);
  } else if (status === "declined") {
    addSystemMessage(conversation.id, "Voice call declined");
  }
  return updated;
}

// Relays one WebRTC signaling payload to the other side of the call.
function relaySignal({ call_id, from_type, data }) {
  if (!PARTICIPANT_TYPES.includes(from_type)) {
    throw badRequest(`from_type must be one of ${PARTICIPANT_TYPES.join(", ")}`);
  }
  if (!data || typeof data !== "object") throw badRequest("data is required");
  const call = getCall(call_id);
  if (!["ringing", "answered"].includes(call.status)) {
    throw badRequest(`Call is already ${call.status}`);
  }
  const conversation = getConversation(call.conversation_id);
  const delivered = publish(counterpartKey(conversation, from_type), "call:signal", { call_id: call.id, from_type, data });
  return { delivered };
}

function listCalls(conversationId) {
  getConversation(conversationId);
  return getDb().prepare("SELECT * FROM calls WHERE conversation_id = ? ORDER BY id DESC LIMIT 50").all(conversationId);
}

module.exports = { startCall, updateCallStatus, relaySignal, listCalls };
