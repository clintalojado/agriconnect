// Facebook Messenger webhook. Setup: in the Meta app, set the callback URL to
// https://<host>/api/messenger/webhook and the verify token to
// MESSENGER_VERIFY_TOKEN; subscribe the page to "messages".

const crypto = require("crypto");
const express = require("express");
const { handleInbound } = require("../services/inbound.service");
const { showTyping } = require("../services/messenger/provider");

const router = express.Router();

// Meta's one-time subscription check.
router.get("/webhook", (req, res) => {
  const expected = process.env.MESSENGER_VERIFY_TOKEN;
  if (expected && req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === expected) {
    return res.status(200).send(req.query["hub.challenge"]);
  }
  res.sendStatus(403);
});

// With MESSENGER_APP_SECRET set, reject payloads not signed by Meta.
function validSignature(req) {
  const secret = process.env.MESSENGER_APP_SECRET;
  if (!secret) return true;
  const header = req.get("x-hub-signature-256") || "";
  if (!req.rawBody || !header.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", secret).update(req.rawBody).digest("hex");
  const given = header.slice("sha256=".length);
  return given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

router.post("/webhook", (req, res) => {
  if (!validSignature(req)) return res.sendStatus(401);
  const body = req.body || {};
  if (body.object !== "page") return res.sendStatus(404);

  // Acknowledge right away; Meta retries if the webhook is slow.
  res.status(200).send("EVENT_RECEIVED");

  for (const entry of body.entry || []) {
    for (const event of entry.messaging || []) {
      const text = event.message?.text;
      if (!text || event.message.is_echo || !event.sender?.id) continue;
      showTyping(event.sender.id);
      handleInbound({ channel: "messenger", sender: event.sender.id, text }).catch((error) =>
        console.error(`[messenger] failed to handle message from ${event.sender.id}: ${error.message}`)
      );
    }
  }
});

module.exports = router;
