// Facebook Messenger Send API. With MESSENGER_PAGE_TOKEN unset, replies are
// only printed to the server log (like SMS_PROVIDER=console), which is what
// the staff simulator uses.

// Unversioned calls use the Meta app's own API version, so the app keeps
// working when old Graph versions are retired. Set MESSENGER_GRAPH_VERSION
// (e.g. "v24.0") to pin one.
function graphUrl() {
  const version = process.env.MESSENGER_GRAPH_VERSION;
  return `https://graph.facebook.com/${version ? `${version}/` : ""}me/messages`;
}

function isConfigured() {
  return Boolean(process.env.MESSENGER_PAGE_TOKEN);
}

async function callSendApi(body) {
  const res = await fetch(`${graphUrl()}?access_token=${encodeURIComponent(process.env.MESSENGER_PAGE_TOKEN)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Messenger responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

async function sendMessengerText(psid, text) {
  if (!isConfigured()) {
    console.log(`[messenger:console] -> ${psid}: ${text}`);
    return;
  }
  await callSendApi({
    recipient: { id: psid },
    messaging_type: "RESPONSE",
    message: { text: text.slice(0, 2000) }, // Messenger's text limit
  });
}

// "Seen" + "typing…" while the message is being read, so the farmer knows a
// reply is coming. Best effort: a failure here never blocks the reply.
async function showTyping(psid) {
  if (!isConfigured()) return;
  try {
    await callSendApi({ recipient: { id: psid }, sender_action: "mark_seen" });
    await callSendApi({ recipient: { id: psid }, sender_action: "typing_on" });
  } catch (error) {
    console.warn(`[messenger] typing indicator failed for ${psid}: ${error.message}`);
  }
}

// First-contact experience for people who open the Page's chat: a greeting
// above the conversation and a "Get Started" button (its tap arrives as a
// postback with payload GET_STARTED). Set once at startup; safe to repeat.
const GET_STARTED = "GET_STARTED";

async function setupMessengerProfile() {
  if (!isConfigured()) return;
  const version = process.env.MESSENGER_GRAPH_VERSION;
  const url = `https://graph.facebook.com/${version ? `${version}/` : ""}me/messenger_profile?access_token=${encodeURIComponent(process.env.MESSENGER_PAGE_TOKEN)}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        get_started: { payload: GET_STARTED },
        greeting: [
          {
            locale: "default",
            text: "Kumusta, {{user_first_name}}! 🌾 Mag-order ng abono, binhi, gamot, at feeds mula sa verified suppliers ng M'lang. Tagalog, Bisaya, o English — i-tap ang Get Started.",
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
    console.log("[messenger] Get Started button and greeting are set");
  } catch (error) {
    console.warn(`[messenger] could not set Get Started/greeting: ${error.message}`);
  }
}

module.exports = { sendMessengerText, showTyping, isConfigured, setupMessengerProfile, GET_STARTED };
