const crypto = require("crypto");
const { getDb } = require("../db/connection");
const { samePhone } = require("../utils/phone");
const { badRequest, notFound } = require("../utils/errors");

const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;

// FARMER_VERIFICATION=auto skips the barangay/LGU/cooperative review (demos);
// the default "required" follows the BPMN: new profiles wait for a verifier.
function initialVerificationStatus() {
  return (process.env.FARMER_VERIFICATION || "required").toLowerCase() === "auto" ? "verified" : "pending";
}

function getFarmer(id) {
  const farmer = getDb().prepare("SELECT * FROM farmers WHERE id = ?").get(id);
  if (!farmer) throw notFound("Farmer not found");
  return farmer;
}

// Matches any format of the same PH number (0917…, +63917…, 63917…).
function findFarmerByPhone(phone) {
  if (!phone) return null;
  return (
    getDb()
      .prepare("SELECT * FROM farmers WHERE phone_number IS NOT NULL ORDER BY id")
      .all()
      .find((f) => samePhone(f.phone_number, phone)) || null
  );
}

function findFarmerByMessengerId(psid) {
  if (!psid) return null;
  return getDb().prepare("SELECT * FROM farmers WHERE messenger_psid = ?").get(String(psid)) || null;
}

/**
 * Registers a farmer, or returns the existing one with the same phone number.
 * `phone_verified` is set when the number is already proven — e.g. the
 * registration itself came in as an SMS from that number.
 */
function findOrCreateFarmer({ name, phone_number, barangay, municipality, messenger_psid = null, phone_verified = false }) {
  const db = getDb();

  const existing = findFarmerByPhone(phone_number) || findFarmerByMessengerId(messenger_psid);
  if (existing) {
    if (messenger_psid && !existing.messenger_psid) {
      db.prepare("UPDATE farmers SET messenger_psid = ? WHERE id = ?").run(String(messenger_psid), existing.id);
    }
    if (phone_verified && !existing.phone_verified) {
      db.prepare("UPDATE farmers SET phone_verified = 1 WHERE id = ?").run(existing.id);
    }
    return getFarmer(existing.id);
  }

  const status = initialVerificationStatus();
  const result = db
    .prepare(
      `INSERT INTO farmers (name, phone_number, barangay, municipality, messenger_psid, phone_verified,
                            verification_status, verified_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'verified' THEN datetime('now') END, datetime('now'))`
    )
    .run(
      name.trim(),
      phone_number || null,
      barangay.trim(),
      municipality.trim(),
      messenger_psid ? String(messenger_psid) : null,
      phone_verified ? 1 : 0,
      status,
      status
    );

  return getFarmer(result.lastInsertRowid);
}

// Edits a profile in place, so the farmer keeps their requests and chats.
function updateFarmer(id, { name, phone_number, barangay, municipality }) {
  const db = getDb();
  const farmer = getFarmer(id);

  if (phone_number) {
    const owner = findFarmerByPhone(phone_number);
    if (owner && owner.id !== farmer.id) {
      throw badRequest("That phone number is already registered to another farmer");
    }
  }
  // A new number has to be proven again.
  const phoneChanged = !samePhone(phone_number, farmer.phone_number);

  db.prepare(
    `UPDATE farmers SET name = ?, phone_number = ?, barangay = ?, municipality = ?,
            phone_verified = CASE WHEN ? THEN 0 ELSE phone_verified END
     WHERE id = ?`
  ).run(name.trim(), phone_number || null, barangay.trim(), municipality.trim(), phoneChanged ? 1 : 0, id);
  return getFarmer(id);
}

function listFarmers({ status, q } = {}) {
  const db = getDb();
  const clauses = [];
  const params = [];
  if (status) {
    clauses.push("f.verification_status = ?");
    params.push(status);
  }
  if (q) {
    clauses.push("(f.name LIKE ? OR f.barangay LIKE ? OR f.municipality LIKE ? OR f.phone_number LIKE ?)");
    params.push(...Array(4).fill(`%${q}%`));
  }
  return db
    .prepare(
      `SELECT f.*,
              (SELECT COUNT(*) FROM farm_input_requests r WHERE r.farmer_id = f.id) AS request_count,
              (SELECT vr.note FROM verification_records vr WHERE vr.farmer_id = f.id ORDER BY vr.id DESC LIMIT 1) AS last_verification_note
       FROM farmers f
       ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
       ORDER BY CASE f.verification_status WHEN 'pending' THEN 0 WHEN 'more_info' THEN 1 ELSE 2 END, f.id DESC`
    )
    .all(...params);
}

// ---------- OTP (proves the farmer owns the phone number) ----------

function hashCode(farmerId, code) {
  return crypto.createHash("sha256").update(`${farmerId}:${code}`).digest("hex");
}

/**
 * Creates a one-time code for the farmer's phone. The caller texts it; with
 * the console SMS gateway (development) the code is also returned as
 * `dev_code` so it can be shown on screen.
 */
function createOtp(farmerId) {
  const farmer = getFarmer(farmerId);
  if (!farmer.phone_number) throw badRequest("Add a mobile number to the profile first");
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const db = getDb();
  db.prepare("UPDATE otp_codes SET consumed_at = datetime('now') WHERE farmer_id = ? AND consumed_at IS NULL").run(farmerId);
  db.prepare(
    `INSERT INTO otp_codes (farmer_id, phone, code_hash, expires_at)
     VALUES (?, ?, ?, datetime('now', '+${OTP_TTL_MINUTES} minutes'))`
  ).run(farmerId, farmer.phone_number, hashCode(farmerId, code));
  return { farmer, code, ttl_minutes: OTP_TTL_MINUTES };
}

function verifyOtp(farmerId, code) {
  const db = getDb();
  const otp = db
    .prepare(
      `SELECT * FROM otp_codes
       WHERE farmer_id = ? AND consumed_at IS NULL AND expires_at > datetime('now')
       ORDER BY id DESC LIMIT 1`
    )
    .get(farmerId);
  if (!otp) throw badRequest("The code has expired. Ask for a new one.");
  if (otp.attempts >= OTP_MAX_ATTEMPTS) throw badRequest("Too many wrong tries. Ask for a new code.");

  if (otp.code_hash !== hashCode(farmerId, String(code || "").trim())) {
    db.prepare("UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?").run(otp.id);
    throw badRequest("That code is not correct.");
  }
  db.prepare("UPDATE otp_codes SET consumed_at = datetime('now') WHERE id = ?").run(otp.id);
  db.prepare("UPDATE farmers SET phone_verified = 1 WHERE id = ?").run(farmerId);
  return getFarmer(farmerId);
}

function hasPendingOtp(farmerId) {
  return Boolean(
    getDb()
      .prepare("SELECT 1 FROM otp_codes WHERE farmer_id = ? AND consumed_at IS NULL AND expires_at > datetime('now')")
      .get(farmerId)
  );
}

module.exports = {
  getFarmer,
  findOrCreateFarmer,
  findFarmerByPhone,
  findFarmerByMessengerId,
  updateFarmer,
  listFarmers,
  createOtp,
  verifyOtp,
  hasPendingOtp,
};
