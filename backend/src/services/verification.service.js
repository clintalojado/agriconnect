// BPMN phase 1, verifier lane: a barangay / LGU / cooperative officer reviews
// each new farmer profile and approves it, rejects it, or asks for more
// information. Every decision is kept as a verification record.

const { getDb } = require("../db/connection");
const { getFarmer, createOtp, verifyOtp } = require("./farmers.service");
const { releaseHeldRequests } = require("./requests.service");
const { notify, textFarmer, notifyStaff } = require("./notifications.service");
const { getProvider } = require("./sms/providers");
const { badRequest } = require("../utils/errors");

const DECISIONS = {
  approved: { status: "verified", title: "Your profile is verified", text: "Verified na ang iyong AgriConnect profile! Ipapadala na sa mga supplier ang iyong mga request." },
  rejected: { status: "rejected", title: "Your profile was not approved", text: "Hindi na-verify ang iyong AgriConnect profile." },
  more_info: { status: "more_info", title: "More information needed", text: "Kailangan pa ng dagdag na impormasyon para ma-verify ang iyong AgriConnect profile." },
};

async function decideFarmerVerification({ farmer_id, decision, verifier_name, note }) {
  const rule = DECISIONS[decision];
  if (!rule) throw badRequest(`decision must be one of ${Object.keys(DECISIONS).join(", ")}`);
  const verifier = typeof verifier_name === "string" ? verifier_name.trim() : "";
  if (!verifier) throw badRequest("verifier_name is required (who is verifying, e.g. \"Brgy. Katipunan Secretary\")");
  const cleanNote = note ? String(note).trim() : null;
  if (decision !== "approved" && !cleanNote) throw badRequest("Add a note telling the farmer why");

  getFarmer(farmer_id);
  const db = getDb();
  db.prepare("INSERT INTO verification_records (farmer_id, verifier_name, decision, note) VALUES (?, ?, ?, ?)").run(
    farmer_id,
    verifier,
    decision,
    cleanNote
  );
  db.prepare(
    "UPDATE farmers SET verification_status = ?, verified_at = CASE WHEN ? = 'verified' THEN datetime('now') ELSE verified_at END WHERE id = ?"
  ).run(rule.status, rule.status, farmer_id);

  const farmer = getFarmer(farmer_id);
  await notify({
    recipient_type: "farmer",
    recipient_id: farmer.id,
    kind: "verification",
    title: rule.title,
    body: cleanNote || (decision === "approved" ? "Suppliers can now see and quote on your requests." : null),
    link: "#/settings",
    text: `[AgriConnect] ${rule.text}${cleanNote ? ` ${cleanNote}` : ""}`,
  });

  const released = decision === "approved" ? await releaseHeldRequests(farmer.id) : 0;
  notifyStaff("verification", { farmer_id: farmer.id, status: farmer.verification_status });
  return { farmer, released_requests: released };
}

function listVerificationRecords(farmerId) {
  getFarmer(farmerId);
  return getDb().prepare("SELECT * FROM verification_records WHERE farmer_id = ? ORDER BY id DESC").all(farmerId);
}

/**
 * Text a one-time code to the farmer's phone. With the console SMS gateway
 * (development) the code is also returned so it can be shown on screen.
 */
async function sendOtp(farmerId) {
  const { farmer, code, ttl_minutes } = createOtp(farmerId);
  const sms = await textFarmer(
    { ...farmer, messenger_psid: null }, // the code must go to the phone being proven
    `Ang iyong AgriConnect code ay ${code}. Valid ng ${ttl_minutes} minuto. Huwag itong ibigay sa iba.`
  );
  return {
    sent: sms?.status === "sent",
    phone: farmer.phone_number,
    ttl_minutes,
    ...(getProvider().name === "console" ? { dev_code: code } : {}),
  };
}

function confirmOtp(farmerId, code) {
  return verifyOtp(farmerId, code);
}

module.exports = { decideFarmerVerification, listVerificationRecords, sendOtp, confirmOtp };
