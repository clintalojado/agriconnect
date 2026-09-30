// Public website chat: the same bot as SMS/Messenger (registration, orders,
// ML answers), for anyone with a browser — no Facebook account needed.
// A visitor is identified by a random session id their browser generates;
// it doubles as the key to read their own chat history.

const express = require("express");
const { handleInbound } = require("../services/inbound.service");
const { getDb } = require("../db/connection");

const router = express.Router();

const SESSION_ID = /^[A-Za-z0-9_-]{16,64}$/;
const MAX_MESSAGE_LENGTH = 500;

// Small in-memory rate limit (single process): per IP and per session.
const LIMITS = { perIp: 40, perSession: 20, windowMs: 60_000 };
const hits = new Map();
function limited(key, max) {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < LIMITS.windowMs);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < LIMITS.windowMs)) hits.delete(k);
  return recent.length > max;
}

router.post("/message", async (req, res, next) => {
  const { session_id, message } = req.body || {};
  if (typeof session_id !== "string" || !SESSION_ID.test(session_id)) {
    return res.status(400).json({ message: "session_id must be 16-64 letters, digits, _ or -" });
  }
  const text = typeof message === "string" ? message.trim() : "";
  if (!text) return res.status(400).json({ message: "message is required" });
  if (text.length > MAX_MESSAGE_LENGTH) return res.status(400).json({ message: `message is limited to ${MAX_MESSAGE_LENGTH} characters` });
  if (limited(`ip:${req.ip}`, LIMITS.perIp) || limited(`s:${session_id}`, LIMITS.perSession)) {
    return res.status(429).json({ message: "Too many messages — please wait a minute." });
  }
  try {
    const result = await handleInbound({ channel: "web", sender: session_id, text });
    res.json({ reply: result.reply?.body ?? null, reply_id: result.reply?.id ?? null, registered: Boolean(result.farmer) });
  } catch (err) {
    next(err);
  }
});

// This session's messages, oldest first; ?after_id= returns only newer ones
// (the chat polls this to show supplier quotes that arrive later).
router.get("/history", (req, res) => {
  const { session_id } = req.query;
  if (typeof session_id !== "string" || !SESSION_ID.test(session_id)) {
    return res.status(400).json({ message: "session_id is required" });
  }
  const afterId = Number.parseInt(req.query.after_id, 10) || 0;
  const rows = getDb()
    .prepare(
      `SELECT id, direction, body, created_at FROM sms_messages
       WHERE channel = 'web' AND phone = ? AND id > ? ORDER BY id LIMIT 200`
    )
    .all(session_id, afterId);
  res.json(rows);
});

module.exports = router;
