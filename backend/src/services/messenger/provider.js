// Facebook Messenger Send API. With MESSENGER_PAGE_TOKEN unset, replies are
// only printed to the server log (like SMS_PROVIDER=console), which is what
// the staff simulator uses.

const GRAPH_URL = "https://graph.facebook.com/v19.0/me/messages";

function isConfigured() {
  return Boolean(process.env.MESSENGER_PAGE_TOKEN);
}

async function sendMessengerText(psid, text) {
  if (!isConfigured()) {
    console.log(`[messenger:console] -> ${psid}: ${text}`);
    return;
  }
  const res = await fetch(`${GRAPH_URL}?access_token=${encodeURIComponent(process.env.MESSENGER_PAGE_TOKEN)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: psid },
      messaging_type: "RESPONSE",
      message: { text: text.slice(0, 2000) }, // Messenger's text limit
    }),
  });
  if (!res.ok) {
    throw new Error(`Messenger responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

module.exports = { sendMessengerText, isConfigured };
