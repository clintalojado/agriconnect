// Points the SMS Gateway for Android app at AgriConnect, so texts the phone
// receives are forwarded to POST /api/sms/inbound.
//
//   npm run sms:webhook -- https://agriconnect-61co.onrender.com   register
//   npm run sms:webhook                                             list
//
// Reads SMSGATE_USERNAME / SMSGATE_PASSWORD (and optional SMSGATE_URL,
// SMS_WEBHOOK_SECRET) from the environment or backend/.env.

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const { smsGateUrl } = require("../src/services/sms/providers");

async function call(method, path, body) {
  const user = process.env.SMSGATE_USERNAME;
  const password = process.env.SMSGATE_PASSWORD;
  if (!user || !password) throw new Error("Set SMSGATE_USERNAME and SMSGATE_PASSWORD (shown in the app's Cloud server section)");
  const res = await fetch(`${smsGateUrl()}${path}`, {
    method,
    headers: { Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SMS Gateway responded ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  const host = process.argv[2];
  if (host) {
    const url = new URL("/api/sms/inbound", host);
    if (process.env.SMS_WEBHOOK_SECRET) url.searchParams.set("secret", process.env.SMS_WEBHOOK_SECRET);
    // A fixed id makes re-running this replace the webhook instead of adding a second one.
    await call("POST", "/webhooks", { id: "agriconnect-inbound", url: url.toString(), event: "sms:received" });
    console.log(`Registered: texts to the phone now go to ${url.origin}${url.pathname}`);
  }
  const hooks = (await call("GET", "/webhooks")) || [];
  console.log("Webhooks on this account:");
  for (const hook of hooks) console.log(`  ${hook.id}  ${hook.event}  ${hook.url}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
