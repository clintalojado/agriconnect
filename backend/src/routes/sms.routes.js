const crypto = require("crypto");
const express = require("express");
const { handleInbound } = require("../services/inbound.service");
const { getSmsLog } = require("../services/sms.service");
const { getProvider } = require("../services/sms/providers");
const { isConfigured: messengerConfigured } = require("../services/messenger/provider");

const router = express.Router();

// Optional shared secret for the inbound webhook: set SMS_WEBHOOK_SECRET and
// configure the gateway to send it as ?secret=... or an X-Webhook-Secret header.
function checkWebhookSecret(req, res, next) {
  const expected = process.env.SMS_WEBHOOK_SECRET;
  if (!expected) return next();
  const given = req.get("x-webhook-secret") || req.query.secret;
  if (given !== expected) return res.status(401).json({ message: "Invalid webhook secret" });
  next();
}

// SMS Gateway for Android signs webhooks when a signing key is set in the app
// (Settings → Webhooks): X-Signature = hex HMAC-SHA256(raw body + X-Timestamp).
function validSmsGateSignature(req) {
  const key = process.env.SMSGATE_SIGNING_KEY;
  if (!key) return true;
  const signature = req.get("x-signature") || "";
  const timestamp = req.get("x-timestamp") || "";
  if (!req.rawBody || !signature || !timestamp) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = crypto.createHmac("sha256", key).update(Buffer.concat([req.rawBody, Buffer.from(timestamp)])).digest("hex");
  return signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// The app retries a webhook it thinks failed; remember recent ids so a retry
// doesn't make the farmer get the same reply twice.
const seenSmsGateIds = new Set();

function handleSmsGateWebhook(req, res) {
  if (!validSmsGateSignature(req)) {
    console.warn("[sms:android] webhook rejected: bad X-Signature — check SMSGATE_SIGNING_KEY matches the app's signing key");
    return res.sendStatus(401);
  }
  const { event, id, payload = {} } = req.body;
  // Acknowledge right away: the app retries anything slower than 30 seconds.
  res.sendStatus(200);
  if (event !== "sms:received") return;
  if (id) {
    if (seenSmsGateIds.has(id)) return;
    seenSmsGateIds.add(id);
    if (seenSmsGateIds.size > 1000) seenSmsGateIds.delete(seenSmsGateIds.values().next().value);
  }
  const sender = payload.sender || payload.phoneNumber;
  console.log(`[sms:android] received a text from ${sender}`);
  handleInbound({ channel: "sms", sender, text: payload.message }).catch((error) =>
    console.error(`[sms:android] failed to handle text from ${sender}: ${error.message}`)
  );
}

// Inbound texts from the gateway. Accepts SMS Gateway for Android webhooks,
// JSON { from, message }, and Twilio-style form posts { From, Body }.
// Replies go out through the gateway.
router.post("/inbound", checkWebhookSecret, async (req, res, next) => {
  const body = req.body || {};
  if (typeof body.event === "string" && body.payload) return handleSmsGateWebhook(req, res);

  const from = body.from || body.From || body.sender || body.number;
  const message = body.message || body.Body || body.text;
  const isTwilio = Boolean(body.From && body.Body);

  try {
    const result = await handleInbound({ channel: "sms", sender: from, text: message });
    if (isTwilio) {
      // The reply already went out through the gateway; tell Twilio not to send another.
      return res.type("text/xml").send("<Response></Response>");
    }
    res.json(result);
  } catch (err) {
    if (isTwilio && !err.status) return res.type("text/xml").send("<Response></Response>");
    next(err);
  }
});

// Log of SMS and Messenger texts. ?limit=&phone=&channel=sms|messenger
router.get("/log", (req, res, next) => {
  try {
    res.json(getSmsLog({ limit: req.query.limit, phone: req.query.phone, channel: req.query.channel }));
  } catch (err) {
    next(err);
  }
});

router.get("/status", (req, res, next) => {
  try {
    res.json({ provider: getProvider().name, messenger: messengerConfigured() ? "facebook" : "console" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
