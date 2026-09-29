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
    console.log("[messenger] webhook verified by Meta");
    return res.status(200).send(req.query["hub.challenge"]);
  }
  console.warn("[messenger] webhook verification failed: verify token does not match MESSENGER_VERIFY_TOKEN");
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
  if (!validSignature(req)) {
    console.warn("[messenger] webhook rejected: bad X-Hub-Signature-256 — check MESSENGER_APP_SECRET is the App secret (App settings → Basic), not the App ID");
    return res.sendStatus(401);
  }
  const body = req.body || {};
  if (body.object !== "page") {
    console.warn(`[messenger] webhook ignored: object "${body.object}" (expected "page")`);
    return res.sendStatus(404);
  }
  const events = (body.entry || []).reduce((n, e) => n + (e.messaging || []).length, 0);
  console.log(`[messenger] webhook received ${events} event(s)`);

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
