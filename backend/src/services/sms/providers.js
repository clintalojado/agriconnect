// SMS gateway drivers. Pick one with SMS_PROVIDER:
//   console   (default) — prints the text to the server log; nothing is sent.
//                         Good for development and demos.
//   semaphore — Semaphore (semaphore.co), a common Philippine SMS gateway.
//               Needs SEMAPHORE_API_KEY; SEMAPHORE_SENDER_NAME optional.
//   twilio    — Twilio Programmable Messaging.
//               Needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER.
//   android   — free: the "SMS Gateway for Android" app (sms-gate.app) on a
//               phone with a SIM, in Cloud mode. Texts go out from that SIM.
//               Needs SMSGATE_USERNAME, SMSGATE_PASSWORD (shown in the app);
//               SMSGATE_URL optional (defaults to the public cloud server).
//
// Each driver's send() resolves on success and throws on failure.

const { normalizePhone } = require("../../utils/phone");

const consoleProvider = {
  name: "console",
  async send(to, body) {
    console.log(`[sms:console] -> ${to}: ${body}`);
  },
};

const semaphoreProvider = {
  name: "semaphore",
  async send(to, body) {
    const apiKey = process.env.SEMAPHORE_API_KEY;
    if (!apiKey) throw new Error("SEMAPHORE_API_KEY is not set");

    const form = new URLSearchParams({ apikey: apiKey, number: to, message: body });
    if (process.env.SEMAPHORE_SENDER_NAME) form.set("sendername", process.env.SEMAPHORE_SENDER_NAME);

    const res = await fetch("https://api.semaphore.co/api/v4/messages", { method: "POST", body: form });
    if (!res.ok) {
      throw new Error(`Semaphore responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
  },
};

const twilioProvider = {
  name: "twilio",
  async send(to, body) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM_NUMBER;
    if (!sid || !token || !from) {
      throw new Error("TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER must be set");
    }

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` },
      body: new URLSearchParams({ To: toE164(to), From: from, Body: body }),
    });
    if (!res.ok) {
      throw new Error(`Twilio responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
  },
};

const androidProvider = {
  name: "android",
  async send(to, body) {
    const user = process.env.SMSGATE_USERNAME;
    const password = process.env.SMSGATE_PASSWORD;
    if (!user || !password) throw new Error("SMSGATE_USERNAME and SMSGATE_PASSWORD must be set");

    const res = await fetch(`${smsGateUrl()}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ textMessage: { text: body }, phoneNumbers: [toE164(to)] }),
    });
    if (!res.ok) {
      throw new Error(`SMS Gateway responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
  },
};

function smsGateUrl() {
  return (process.env.SMSGATE_URL || "https://api.sms-gate.app/3rdparty/v1").replace(/\/+$/, "");
}

const PROVIDERS = { console: consoleProvider, semaphore: semaphoreProvider, twilio: twilioProvider, android: androidProvider };

function getProvider() {
  const name = (process.env.SMS_PROVIDER || "console").toLowerCase();
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new Error(`Unknown SMS_PROVIDER "${name}" (expected ${Object.keys(PROVIDERS).join(", ")})`);
  }
  return provider;
}

function toE164(phone) {
  const normalized = normalizePhone(phone);
  return normalized ? `+${normalized}` : phone;
}

module.exports = { getProvider, smsGateUrl };
