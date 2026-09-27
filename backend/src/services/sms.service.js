// Text-channel transport: sending and logging SMS and Messenger texts.
// What an incoming text *means* is handled by inbound.service.js.

const { getDb } = require("../db/connection");
const { getProvider } = require("./sms/providers");
const { sendMessengerText } = require("./messenger/provider");
const { normalizePhone } = require("../utils/phone");
const { badRequest } = require("../utils/errors");

const CHANNELS = ["sms", "messenger"];

function logMessage({ channel = "sms", direction, phone, body, provider, status, error = null, farmer_id = null, request_id = null }) {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO sms_messages (channel, direction, phone, body, provider, status, error, farmer_id, request_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(channel, direction, phone, body, provider, status, error, farmer_id, request_id);
  return db.prepare("SELECT * FROM sms_messages WHERE id = ?").get(result.lastInsertRowid);
}

/**
 * Send one text through the configured SMS gateway and log it. Never throws
 * for gateway failures — the failure is logged with status "failed" and
 * returned, so an SMS outage can't break the action that triggered the text.
 */
async function sendSms({ to, body, farmer_id = null, request_id = null }) {
  if (!to) throw badRequest("Recipient phone number is required");
  if (!body || !body.trim()) throw badRequest("SMS body is required");

  const provider = getProvider();
  const entry = { channel: "sms", direction: "outbound", phone: to, body, provider: provider.name, farmer_id, request_id };
  try {
    await provider.send(to, body);
    return logMessage({ ...entry, status: "sent" });
  } catch (error) {
    console.error(`[sms:${provider.name}] send to ${to} failed: ${error.message}`);
    return logMessage({ ...entry, status: "failed", error: error.message });
  }
}

/** Reply on whichever channel the farmer used. Same never-throws contract as sendSms. */
async function sendToChannel({ channel, to, body, farmer_id = null, request_id = null }) {
  if (channel === "sms") return sendSms({ to, body, farmer_id, request_id });
  if (channel !== "messenger") throw badRequest(`Unknown channel "${channel}"`);

  const entry = { channel, direction: "outbound", phone: to, body, provider: "messenger", farmer_id, request_id };
  try {
    await sendMessengerText(to, body);
    return logMessage({ ...entry, status: "sent" });
  } catch (error) {
    console.error(`[messenger] send to ${to} failed: ${error.message}`);
    return logMessage({ ...entry, status: "failed", error: error.message });
  }
}

function logInbound({ channel, sender, body, farmer_id }) {
  return logMessage({
    channel,
    direction: "inbound",
    phone: sender,
    body,
    provider: channel === "sms" ? getProvider().name : "messenger",
    status: "received",
    farmer_id,
  });
}

/** Log of texts, newest first. `sender` matches any format of the same PH number. */
function getSmsLog({ limit = 50, phone, channel } = {}) {
  const db = getDb();
  const cappedLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const where = CHANNELS.includes(channel) ? "WHERE channel = ?" : "";
  const params = CHANNELS.includes(channel) ? [channel] : [];
  if (phone) {
    const target = normalizePhone(phone);
    return db
      .prepare(`SELECT * FROM sms_messages ${where} ORDER BY id DESC LIMIT 1000`)
      .all(...params)
      .filter((row) => row.phone === phone || (target && normalizePhone(row.phone) === target))
      .slice(0, cappedLimit);
  }
  return db.prepare(`SELECT * FROM sms_messages ${where} ORDER BY id DESC LIMIT ?`).all(...params, cappedLimit);
}

module.exports = { sendSms, sendToChannel, logInbound, getSmsLog, CHANNELS };
