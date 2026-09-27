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

// Inbound texts from the gateway. Accepts JSON { from, message } and
// Twilio-style form posts { From, Body }. Replies go out through the gateway.
router.post("/inbound", checkWebhookSecret, async (req, res, next) => {
  const body = req.body || {};
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
