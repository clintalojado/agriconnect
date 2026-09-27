const { getDb } = require("../db/connection");
const { participantKey, publish, isOnline } = require("../realtime/hub");
const { sendSms } = require("./sms.service");

const PARTICIPANT_TYPES = ["farmer", "supplier"];

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

function otherSide(type) {
  return type === "farmer" ? "supplier" : "farmer";
}

const CONVERSATION_SELECT = `
  SELECT c.*,
         f.name AS farmer_name, f.phone_number AS farmer_phone, f.barangay AS farmer_barangay,
         s.name AS supplier_name, s.phone AS supplier_phone, s.contact_person AS supplier_contact
  FROM conversations c
  JOIN farmers f ON f.id = c.farmer_id
  JOIN suppliers s ON s.id = c.supplier_id`;

function getConversation(id) {
  const db = getDb();
  const conversation = db.prepare(`${CONVERSATION_SELECT} WHERE c.id = ?`).get(id);
  if (!conversation) throw notFound("Conversation not found");
  return conversation;
}

// Publishes an event to both sides so every open tab stays in sync.
function publishToConversation(conversation, event, data) {
  publish(participantKey("farmer", conversation.farmer_id), event, data);
  publish(participantKey("supplier", conversation.supplier_id), event, data);
}

function getOrCreateConversation({ farmer_id, supplier_id, offer_id = null }) {
  const db = getDb();
  if (!db.prepare("SELECT id FROM farmers WHERE id = ?").get(farmer_id)) throw badRequest("Unknown farmer_id");
  if (!db.prepare("SELECT id FROM suppliers WHERE id = ?").get(supplier_id)) throw badRequest("Unknown supplier_id");

  const existing = db
    .prepare("SELECT id FROM conversations WHERE farmer_id = ? AND supplier_id = ?")
    .get(farmer_id, supplier_id);
  if (existing) return getConversation(existing.id);

  const result = db
    .prepare("INSERT INTO conversations (farmer_id, supplier_id, offer_id) VALUES (?, ?, ?)")
    .run(farmer_id, supplier_id, offer_id);
  return getConversation(result.lastInsertRowid);
}

function listConversations({ participant_type, participant_id }) {
  if (!PARTICIPANT_TYPES.includes(participant_type)) {
    throw badRequest(`participant_type must be one of ${PARTICIPANT_TYPES.join(", ")}`);
  }
  const db = getDb();
  const column = participant_type === "farmer" ? "c.farmer_id" : "c.supplier_id";
  const rows = db
    .prepare(
      `SELECT c.*,
              f.name AS farmer_name, f.phone_number AS farmer_phone, f.barangay AS farmer_barangay,
              s.name AS supplier_name, s.phone AS supplier_phone, s.contact_person AS supplier_contact,
              (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message,
              (SELECT sender_type FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_sender_type,
              (SELECT COUNT(*) FROM messages m
                 WHERE m.conversation_id = c.id AND m.read_at IS NULL AND m.sender_type NOT IN (?, 'system')) AS unread_count
       FROM conversations c
       JOIN farmers f ON f.id = c.farmer_id
       JOIN suppliers s ON s.id = c.supplier_id
       WHERE ${column} = ?
       ORDER BY COALESCE(c.last_message_at, c.created_at) DESC`
    )
    .all(participant_type, participant_id);

  return rows.map((row) => ({
    ...row,
    counterpart_online: isOnline(
      participantKey(otherSide(participant_type), participant_type === "farmer" ? row.supplier_id : row.farmer_id)
    ),
  }));
}

function getMessages(conversationId, { after_id } = {}) {
  getConversation(conversationId);
  const db = getDb();
  return db
    .prepare("SELECT * FROM messages WHERE conversation_id = ? AND id > ? ORDER BY id ASC")
    .all(conversationId, Number(after_id) || 0);
}

function insertMessage(conversation, { sender_type, body, channel = "app" }) {
  const db = getDb();
  const result = db
    .prepare("INSERT INTO messages (conversation_id, sender_type, body, channel) VALUES (?, ?, ?, ?)")
    .run(conversation.id, sender_type, body, channel);
  db.prepare("UPDATE conversations SET last_message_at = datetime('now') WHERE id = ?").run(conversation.id);

  const message = db.prepare("SELECT * FROM messages WHERE id = ?").get(result.lastInsertRowid);
  publishToConversation(conversation, "message", { conversation_id: conversation.id, message });
  return message;
}

/**
 * Send a chat message. With send_sms, the recipient also gets it as a text —
 * useful when they are offline or on a basic phone.
 */
async function sendMessage({ conversation_id, sender_type, body, send_sms = false }) {
  if (!PARTICIPANT_TYPES.includes(sender_type)) {
    throw badRequest(`sender_type must be one of ${PARTICIPANT_TYPES.join(", ")}`);
  }
  const text = typeof body === "string" ? body.trim() : "";
  if (!text) throw badRequest("body is required");
  if (text.length > 2000) throw badRequest("body must be at most 2000 characters");

  const conversation = getConversation(conversation_id);
  const message = insertMessage(conversation, { sender_type, body: text, channel: send_sms ? "sms" : "app" });

  let sms = null;
  if (send_sms) {
    const recipientPhone = sender_type === "farmer" ? conversation.supplier_phone : conversation.farmer_phone;
    const senderName = sender_type === "farmer" ? conversation.farmer_name : conversation.supplier_name;
    if (!recipientPhone) {
      sms = { status: "failed", error: "Recipient has no phone number on file" };
    } else {
      sms = await sendSms({
        to: recipientPhone,
        body: `[AgriConnect] ${senderName}: ${text}`,
        farmer_id: conversation.farmer_id,
      });
    }
  }
  return { message, sms };
}

function addSystemMessage(conversationId, body) {
  return insertMessage(getConversation(conversationId), { sender_type: "system", body });
}

function markRead({ conversation_id, reader_type }) {
  if (!PARTICIPANT_TYPES.includes(reader_type)) {
    throw badRequest(`reader_type must be one of ${PARTICIPANT_TYPES.join(", ")}`);
  }
  const conversation = getConversation(conversation_id);
  const db = getDb();
  const result = db
    .prepare(
      `UPDATE messages SET read_at = datetime('now')
       WHERE conversation_id = ? AND read_at IS NULL AND sender_type != ?`
    )
    .run(conversation_id, reader_type);
  if (result.changes > 0) {
    publishToConversation(conversation, "read", { conversation_id: Number(conversation_id), reader_type });
  }
  return { updated: result.changes };
}

module.exports = {
  getConversation,
  getOrCreateConversation,
  listConversations,
  getMessages,
  sendMessage,
  addSystemMessage,
  markRead,
  publishToConversation,
  otherSide,
};
