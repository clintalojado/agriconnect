// Farmer texts arriving by SMS or Messenger — BPMN phases 1 and 2:
//   unknown sender → registration conversation (→ OTP for Messenger phone numbers)
//   registered     → AI reads the text into a structured request (possibly
//                    several products) → farmer confirms by replying OO/YES
//                    (or staff confirms for them) → requests are stored.
// Every order-type text is also kept in the staff inbox (inbound_messages).

const { getDb } = require("../db/connection");
const { extractFarmInputRequest } = require("./nlp.service");
const { detectLanguage } = require("./nlp/rules");
const { describeOrder } = require("./nlp/replies");
const {
  findOrCreateFarmer,
  findFarmerByPhone,
  findFarmerByMessengerId,
  hasPendingOtp,
  verifyOtp,
} = require("./farmers.service");
const { createStructuredRequest, getRequestsByFarmer } = require("./requests.service");
const { findProductByName } = require("./catalog.service");
const { sendToChannel, logInbound, CHANNELS } = require("./sms.service");
const { notifyStaff } = require("./notifications.service");
const { sendOtp } = require("./verification.service");
const { normalizePhone } = require("../utils/phone");
const { canonicalBarangay, findBarangayInText } = require("./locations");
const { badRequest, notFound } = require("../utils/errors");
const { money, perUnit } = require("../utils/format");

const YES = /^\s*(oo|opo|yes|y|ok|okay|oks|sige|confirm|kumpirma|tama|husto|go)\b/i;
const NO = /^\s*(no|hindi|dili|mali|cancel|ulitin|usbon)\b/i;
const OPEN_STATUSES = ["new", "needs_info", "awaiting_confirmation"];
const FIELDS = ["product_name", "quantity", "unit", "barangay", "preferred_date"];

function pick(language, { tagalog, bisaya, english }) {
  if (language === "bisaya") return bisaya;
  if (language === "english") return english;
  return tagalog;
}

const HELP_TEXT =
  'AgriConnect: I-text ang kailangan mo, hal. "5 sako urea at 2 sako 14-14-14, next week". ' +
  "STATUS - tingnan ang mga request. REG Pangalan, Barangay, Bayan - mag-register. (English/Bisaya OK)";

// ---------- Helpers ----------

function findFarmer(channel, sender) {
  return channel === "sms" ? findFarmerByPhone(sender) : findFarmerByMessengerId(sender);
}

function decodeRow(row) {
  if (!row) return row;
  let extraction = null;
  try {
    extraction = row.extraction ? JSON.parse(row.extraction) : null;
  } catch {
    extraction = null;
  }
  return { ...row, extraction };
}

function getInbound(id) {
  const row = getDb()
    .prepare(
      `SELECT im.*, f.name AS farmer_name, f.barangay AS farmer_barangay, f.municipality AS farmer_municipality,
              f.phone_number AS farmer_phone, f.verification_status AS farmer_verification
       FROM inbound_messages im LEFT JOIN farmers f ON f.id = im.farmer_id
       WHERE im.id = ?`
    )
    .get(id);
  if (!row) throw notFound("Message not found");
  return decodeRow(row);
}

function findOpenInbound(farmerId) {
  return getDb()
    .prepare(
      `SELECT * FROM inbound_messages
       WHERE farmer_id = ? AND status IN ('needs_info', 'awaiting_confirmation')
         AND updated_at >= datetime('now', '-1 day')
       ORDER BY id DESC LIMIT 1`
    )
    .get(farmerId);
}

function saveInbound({ id, channel, sender, farmer_id, body, structured, status }) {
  const db = getDb();
  const json = structured ? JSON.stringify(structured) : null;
  if (id) {
    db.prepare("UPDATE inbound_messages SET body = ?, extraction = ?, status = ?, updated_at = datetime('now') WHERE id = ?").run(
      body,
      json,
      status,
      id
    );
    return getInbound(id);
  }
  const result = db
    .prepare("INSERT INTO inbound_messages (channel, sender, farmer_id, body, extraction, status) VALUES (?, ?, ?, ?, ?, ?)")
    .run(channel, sender, farmer_id, body, json, status);
  return getInbound(result.lastInsertRowid);
}

/**
 * The AI extraction reshaped as a structured request: a list of items (the
 * main product plus any others in the same text), shared delivery details,
 * and one overall confidence score for staff.
 */
function toStructured(extraction) {
  const items = [
    { product_name: extraction.product_name, quantity: extraction.quantity, unit: extraction.unit },
    ...(extraction.additional_items || []),
  ]
    .filter((i) => i.product_name)
    .map((i) => ({ ...i, unit: i.unit || findProductByName(i.product_name)?.unit || null }));
  const scores = FIELDS.map((f) => extraction.confidence?.[f]).filter((n) => typeof n === "number");
  return {
    items,
    barangay: extraction.barangay,
    preferred_date: extraction.preferred_date,
    preferred_date_iso: extraction.preferred_date_iso,
    intent: extraction.intent,
    language: extraction.language,
    source: extraction.source,
    confidence: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : 0,
    field_confidence: extraction.confidence,
    clarification_question: extraction.clarification_question,
  };
}

function missingQuestion(structured) {
  const { language } = structured;
  if (structured.items.length === 0) {
    return pick(language, {
      tagalog: "Anong produkto po ang kailangan ninyo? (hal. urea, 14-14-14, binhi ng mais)",
      bisaya: "Unsa nga produkto ang imong kinahanglan? (pananglitan urea, 14-14-14, liso sa mais)",
      english: "Which product do you need? (e.g. urea, 14-14-14, corn seeds)",
    });
  }
  const item = structured.items.find((i) => i.quantity == null || !i.unit);
  if (!item) return null;
  return pick(language, {
    tagalog: `Ilang sako, kilo, o litro po ng ${item.product_name}?`,
    bisaya: `Pila ka sako, kilo, o litro sa ${item.product_name}?`,
    english: `How many sacks, kilos, or liters of ${item.product_name}?`,
  });
}

function itemLines(items) {
  return items.map((item, i) => `${i + 1}) ${describeOrder(item)}`).join("\n");
}

function whenText(structured) {
  if (!structured.preferred_date) return "";
  const iso = structured.preferred_date_iso;
  return `${structured.preferred_date}${iso && iso !== structured.preferred_date ? ` (${iso})` : ""}`;
}

function confirmationPrompt(structured, farmer) {
  const where = `Brgy. ${structured.barangay || farmer.barangay}`;
  const when = whenText(structured);
  return pick(structured.language, {
    tagalog: `Paki-confirm po ang request ninyo:\n${itemLines(structured.items)}\n${where}${when ? ` · kailangan ${when}` : ""}\nI-reply ang OO para i-confirm, o i-text ang tamang detalye.`,
    bisaya: `Palihug i-confirm ang imong request:\n${itemLines(structured.items)}\n${where}${when ? ` · kinahanglan ${when}` : ""}\nI-reply ang OO aron i-confirm, o i-text ang saktong detalye.`,
    english: `Please confirm your request:\n${itemLines(structured.items)}\n${where}${when ? ` · needed ${when}` : ""}\nReply YES to confirm, or text the correct details.`,
  });
}

function publishedReply(language, items, farmer) {
  const held = farmer.verification_status !== "verified";
  return pick(language, {
    tagalog:
      `Salamat! Na-record na ang request ninyo sa AgriConnect:\n${itemLines(items)}\n` +
      (held
        ? "Ipapadala ito sa mga supplier kapag na-verify na ng barangay ang profile ninyo."
        : "Ipapadala namin sa inyo ang mga quote ng supplier."),
    bisaya:
      `Salamat! Na-record na ang imong request sa AgriConnect:\n${itemLines(items)}\n` +
      (held
        ? "Ipadala kini sa mga supplier kung ma-verify na sa barangay ang imong profile."
        : "Ipadala namo kanimo ang mga quote gikan sa supplier."),
    english:
      `Thanks! Your request is recorded in AgriConnect:\n${itemLines(items)}\n` +
      (held ? "It goes to suppliers once your barangay verifies your profile." : "We'll send you the suppliers' quotations."),
  });
}

function bestPriceReply(structured, farmer) {
  const db = getDb();
  const name = structured.items[0]?.product_name;
  const listing = db
    .prepare(
      `SELECT sp.price, sp.unit, s.name AS supplier_name
       FROM supplier_products sp
       JOIN products p ON p.id = sp.product_id
       JOIN suppliers s ON s.id = sp.supplier_id
       WHERE p.name = ? AND sp.in_stock = 1 AND s.verified = 1
       ORDER BY sp.price ASC LIMIT 1`
    )
    .get(name);
  if (!listing) {
    return pick(structured.language, {
      tagalog: `Wala pang supplier na naglista ng ${name}. I-text ang dami para humingi ng quote, hal. "5 sako".`,
      bisaya: `Wala pay supplier nga naglista sa ${name}. I-text ang gidaghanon aron mangayo og quote, pananglitan "5 ka sako".`,
      english: `No supplier lists ${name} yet. Text the quantity to ask for quotations, e.g. "5 sacks".`,
    });
  }
  const price = `${money(listing.price)}/${perUnit(listing.unit)}`;
  return pick(structured.language, {
    tagalog: `Pinakamababang presyo ng ${name}: ${price} mula sa ${listing.supplier_name}. I-text ang dami para mag-request, hal. "5 sako ${name}".`,
    bisaya: `Pinakaubos nga presyo sa ${name}: ${price} gikan sa ${listing.supplier_name}. I-text ang gidaghanon aron mo-request, pananglitan "5 ka sako".`,
    english: `Lowest price for ${name}: ${price} from ${listing.supplier_name}. Text the quantity to request it, e.g. "5 sacks".`,
  });
}

const STATUS_LABEL = {
  draft: "draft",
  awaiting_verification: "hinihintay ang verification",
  for_quotation: "naghihintay ng quote",
  supplier_confirmed: "kumpirmado ng supplier",
  for_delivery: "ide-deliver na",
  delivered: "na-deliver na",
  completed: "tapos na",
  rejected: "hindi tinanggap",
};

function statusReply(farmer) {
  const rows = getRequestsByFarmer(farmer.id).filter((r) => r.status !== "pending_validation").slice(0, 4);
  if (rows.length === 0) return 'Wala ka pang request. I-text ang kailangan mo, hal. "5 sako urea".';
  const lines = rows.map((r) => {
    const quotes = r.display_status === "for_quotation" && r.quote_count ? `, ${r.quote_count} quote` : "";
    return `#${r.id} ${describeOrder(r)} - ${STATUS_LABEL[r.display_status] || r.display_status}${quotes}`;
  });
  return `Mga request mo:\n${lines.join("\n")}`;
}

// ---------- Publishing (farmer said OO, or staff published) ----------

/**
 * Turns a confirmed inbound message into requests, one per product.
 * `overrides` lets staff correct the structured request first.
 */
async function publishInbound(id, { confirmed_by = "farmer", overrides = {} } = {}) {
  const row = getInbound(id);
  if (!row.farmer_id) throw badRequest("The sender isn't registered yet");
  if (!OPEN_STATUSES.includes(row.status)) throw badRequest(`This message is already ${row.status}`);
  const structured = { ...(row.extraction || { items: [] }), ...overrides };
  const items = (structured.items || []).filter((i) => i && i.product_name);
  if (items.length === 0) throw badRequest("Add at least one product");
  for (const item of items) {
    if (!(Number(item.quantity) > 0)) throw badRequest(`Quantity for ${item.product_name} must be a positive number`);
    if (!item.unit) throw badRequest(`Unit for ${item.product_name} is required`);
  }

  const requests = [];
  for (const item of items) {
    requests.push(
      await createStructuredRequest({
        farmer_id: row.farmer_id,
        product_name: item.product_name,
        quantity: item.quantity,
        unit: item.unit,
        preferred_date: structured.preferred_date,
        needed_by: /^\d{4}-\d{2}-\d{2}$/.test(structured.preferred_date_iso || "") ? structured.preferred_date_iso : null,
        delivery_location: structured.delivery_location,
        notes: structured.notes,
        channel: row.channel,
        raw_message: row.body,
        inbound_message_id: row.id,
      })
    );
  }

  getDb()
    .prepare(
      `UPDATE inbound_messages SET status = 'published', confirmed_by = ?, extraction = ?,
              published_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
    )
    .run(confirmed_by, JSON.stringify({ ...structured, items }), row.id);

  const farmer = getDb().prepare("SELECT * FROM farmers WHERE id = ?").get(row.farmer_id);
  const reply = publishedReply(structured.language, items, farmer);
  notifyStaff("inbound", { id: row.id, status: "published" });
  return { inbound: getInbound(row.id), requests, reply };
}

// ---------- Order texts ----------

async function processOrderText({ farmer, channel, sender, text, open }) {
  const merging = open && ["needs_info", "awaiting_confirmation"].includes(open.status);
  const body = merging ? `${open.body}\n${text}` : text;
  const extraction = await extractFarmInputRequest(body, { profileBarangay: farmer.barangay });
  const structured = toStructured(extraction);

  let status;
  let reply;
  if (structured.intent === "inquiry" && structured.items.length && structured.items.every((i) => i.quantity == null)) {
    status = "answered";
    reply = bestPriceReply(structured, farmer);
  } else if (structured.intent !== "purchase_request" && structured.items.length === 0) {
    status = merging ? open.status : "answered";
    reply = extraction.reply_message;
  } else {
    const question = missingQuestion(structured);
    status = question ? "needs_info" : "awaiting_confirmation";
    reply = question || confirmationPrompt(structured, farmer);
  }

  const inbound = saveInbound({
    id: merging ? open.id : null,
    channel,
    sender,
    farmer_id: farmer.id,
    body,
    structured,
    status,
  });
  return { inbound, reply, extraction };
}

// ---------- Registration conversation ----------

function getSession(channel, sender) {
  const row = getDb().prepare("SELECT * FROM registration_sessions WHERE channel = ? AND sender = ?").get(channel, sender);
  return row ? { ...row, data: JSON.parse(row.data || "{}") } : null;
}

function saveSession(channel, sender, { step, data, pending_message }) {
  getDb()
    .prepare(
      `INSERT INTO registration_sessions (channel, sender, step, data, pending_message, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT (channel, sender) DO UPDATE SET
         step = excluded.step, data = excluded.data,
         pending_message = COALESCE(excluded.pending_message, registration_sessions.pending_message),
         updated_at = excluded.updated_at`
    )
    .run(channel, sender, step, JSON.stringify(data || {}), pending_message ?? null);
}

function endSession(channel, sender) {
  getDb().prepare("DELETE FROM registration_sessions WHERE channel = ? AND sender = ?").run(channel, sender);
}

// OTP errors in the farmer's language (the web app shows the English originals).
function otpErrorText(error) {
  if (/expired/i.test(error.message)) return "Expired na ang code.";
  if (/too many/i.test(error.message)) return "Masyadong maraming maling subok. Maaari ninyong i-confirm ang number mamaya sa AgriConnect app.";
  return "Mali ang code.";
}

function registrationSummary(data) {
  return `Pangalan: ${data.name}\nBarangay: ${data.barangay}\nBayan: ${data.municipality}${data.phone ? `\nMobile: ${data.phone}` : ""}`;
}

// Stricter than looksLikeOrder: registration answers may contain numbers
// ("Poblacion 2", "Zone 3"), so only quantities with units or product words count.
function mentionsOrder(text) {
  return /d+s*(sa+ko|sacks?|bags?|kilos?|kg|litro|liters?|bote|bottles?)|urea|abono|fertili|binhi|liso|seeds?|feeds?|pabili|palit|order/i.test(text || "");
}

function looksLikeOrder(text) {
  return /\d|sako|sack|kilo|kg|litro|urea|abono|fertili|binhi|liso|seed|feed|pakain|order|palit|bili/i.test(text || "");
}

/** Completes registration; processes the farmer's first text if it was an order. */
async function finishRegistration({ channel, sender, farmer, session }) {
  endSession(channel, sender);
  const pending = farmer.verification_status === "verified" ? "" : " Ive-verify ng inyong barangay/kooperatiba ang profile ninyo.";
  let reply = `Salamat, ${farmer.name}! Naka-register na kayo sa AgriConnect.${pending}`;
  let outcome = {};
  if (session?.pending_message && looksLikeOrder(session.pending_message)) {
    outcome = await processOrderText({ farmer, channel, sender, text: session.pending_message, open: null });
    reply += `\n\n${outcome.reply}`;
  } else {
    reply += ' I-text na ang kailangan ninyo, hal. "5 sako urea".';
  }
  return { ...outcome, farmer, reply, registration: "completed" };
}

async function createRegisteredFarmer({ channel, sender, data }) {
  const farmer = findOrCreateFarmer({
    name: data.name,
    barangay: data.barangay,
    municipality: data.municipality,
    // An SMS registration proves the number it came from.
    phone_number: channel === "sms" ? sender : data.phone || null,
    phone_verified: channel === "sms",
    messenger_psid: channel === "messenger" ? sender : null,
  });
  notifyStaff("verification", { farmer_id: farmer.id, status: farmer.verification_status });
  return farmer;
}

/** Handles the reply to the current registration question and asks the next one. */
async function continueRegistration({ channel, sender, text, session }) {
  const data = { ...session.data };
  const answer = text.trim();

  // An order sent mid-registration ("5 sako urea") is kept for after sign-up,
  // and the question is asked again instead of saving the order as a name/place.
  const askAgain = (question) => {
    const pending = [session.pending_message, answer].filter((m) => m && mentionsOrder(m)).join("\n");
    saveSession(channel, sender, { step: session.step, data, pending_message: pending || answer });
    return {
      reply: `Natanggap namin ang order ninyo — ipoproseso namin ito pagkatapos mag-register. ${question}`,
      registration: "in_progress",
    };
  };

  switch (session.step) {
    case "name":
      if (mentionsOrder(answer)) return askAgain("Ano po ang buong pangalan ninyo?");
      data.name = answer.slice(0, 80);
      saveSession(channel, sender, { step: "barangay", data });
      return { reply: `Salamat, ${data.name}! Saang barangay po kayo nakatira?`, registration: "in_progress" };
    case "barangay": {
      // A known M'lang barangay anywhere in the answer wins ("sa new rizal po" → New Rizal).
      const known = findBarangayInText(answer);
      if (!known && mentionsOrder(answer)) return askAgain("Saang barangay po kayo nakatira? (hal. Katipunan)");
      data.barangay = known || canonicalBarangay(answer.replace(/^(brgy\.?|barangay)\s+/i, "").slice(0, 80));
      saveSession(channel, sender, { step: "municipality", data });
      return { reply: "Saang bayan o munisipyo po? (hal. M'lang)", registration: "in_progress" };
    }
    case "municipality":
      if (mentionsOrder(answer)) return askAgain("Saang bayan o munisipyo po? (hal. M'lang)");
      data.municipality = answer.slice(0, 80);
      if (channel === "messenger") {
        saveSession(channel, sender, { step: "phone", data });
        return {
          reply: "Ano po ang mobile number ninyo? Dito namin ite-text ang mga update. (I-reply ang SKIP kung wala)",
          registration: "in_progress",
        };
      }
      saveSession(channel, sender, { step: "confirm", data });
      return { reply: `Pakicheck po:\n${registrationSummary(data)}\nI-reply ang OO kung tama, o MALI para ulitin.`, registration: "in_progress" };
    case "phone": {
      if (!/^skip$/i.test(answer)) {
        const phone = normalizePhone(answer);
        if (!phone || phone.length !== 12 || !phone.startsWith("639")) {
          return { reply: "Mukhang mali ang number. I-text ang 11-digit na number (hal. 09171234567) o SKIP.", registration: "in_progress" };
        }
        data.phone = `0${phone.slice(2)}`;
      }
      saveSession(channel, sender, { step: "confirm", data });
      return { reply: `Pakicheck po:\n${registrationSummary(data)}\nI-reply ang OO kung tama, o MALI para ulitin.`, registration: "in_progress" };
    }
    case "confirm": {
      if (NO.test(answer)) {
        saveSession(channel, sender, { step: "name", data: {} });
        return { reply: "Sige po, ulitin natin. Ano po ang buong pangalan ninyo?", registration: "in_progress" };
      }
      if (!YES.test(answer)) {
        return { reply: "I-reply ang OO kung tama ang detalye, o MALI para ulitin.", registration: "in_progress" };
      }
      const farmer = await createRegisteredFarmer({ channel, sender, data });
      if (channel === "messenger" && data.phone && !farmer.phone_verified) {
        // BPMN: prove the phone number with a one-time code before finishing.
        await sendOtp(farmer.id);
        saveSession(channel, sender, { step: "otp", data: { ...data, farmer_id: farmer.id } });
        return {
          farmer,
          reply: `Nagpadala kami ng 6-digit code sa ${data.phone}. I-reply dito ang code para ma-confirm ang number (o SKIP).`,
          registration: "otp",
        };
      }
      return finishRegistration({ channel, sender, farmer, session });
    }
    case "otp": {
      const farmer = getDb().prepare("SELECT * FROM farmers WHERE id = ?").get(data.farmer_id);
      if (!farmer) {
        endSession(channel, sender);
        return { reply: "Paki-ulit ang registration. I-text ang REG.", registration: "restart" };
      }
      if (!/^skip$/i.test(answer)) {
        try {
          verifyOtp(farmer.id, answer.replace(/\D/g, ""));
        } catch (error) {
          return { farmer, reply: `${otpErrorText(error)} I-reply ang tamang code, o SKIP.`, registration: "otp" };
        }
      }
      return finishRegistration({ channel, sender, farmer: getDb().prepare("SELECT * FROM farmers WHERE id = ?").get(farmer.id), session });
    }
    default:
      endSession(channel, sender);
      return { reply: HELP_TEXT };
  }
}

// `session` is set when REG arrives in the middle of the guided registration;
// its saved first message is still processed once registration completes.
async function handleOneLineRegistration({ channel, sender, text, session = null }) {
  const parts = text
    .replace(/^\s*(reg|register)\b[:\s]*/i, "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 3) {
    saveSession(channel, sender, { step: "name", data: {} });
    return { reply: "Mag-register tayo. Ano po ang buong pangalan ninyo?", registration: "in_progress" };
  }
  const [name, barangay, municipality, phone] = parts;
  const data = {
    name,
    barangay: canonicalBarangay(barangay.replace(/^(brgy\.?|barangay)\s+/i, "")),
    municipality,
    phone: phone || null,
  };
  const farmer = await createRegisteredFarmer({ channel, sender, data });
  if (channel === "messenger" && data.phone && !farmer.phone_verified) {
    await sendOtp(farmer.id);
    saveSession(channel, sender, { step: "otp", data: { ...data, farmer_id: farmer.id } });
    return { farmer, reply: `Nagpadala kami ng 6-digit code sa ${data.phone}. I-reply dito ang code (o SKIP).`, registration: "otp" };
  }
  return finishRegistration({ channel, sender, farmer, session });
}

// ---------- Entry point ----------

/**
 * Handle one incoming text. Replies on the same channel and returns what
 * happened: { reply, farmer, inbound, requests, extraction, registration }.
 */
async function handleInbound({ channel, sender, text }) {
  if (!CHANNELS.includes(channel)) throw badRequest(`channel must be one of ${CHANNELS.join(", ")}`);
  const from = typeof sender === "string" || typeof sender === "number" ? String(sender).trim() : "";
  const message = typeof text === "string" ? text.trim() : "";
  if (!from || !message) throw badRequest("sender and message are required");

  let farmer = findFarmer(channel, from);
  logInbound({ channel, sender: from, body: message, farmer_id: farmer?.id ?? null });

  const keyword = message.split(/\s+/)[0].toUpperCase();
  const session = getSession(channel, from);
  let outcome;

  if (["HELP", "TULONG", "TABANG", "INFO"].includes(keyword)) {
    outcome = { reply: HELP_TEXT };
  } else if (["REG", "REGISTER"].includes(keyword) && !farmer && session && session.step !== "otp") {
    // "REG Name, Barangay, Town" in the middle of the guided questions.
    outcome = await handleOneLineRegistration({ channel, sender: from, text: message, session });
  } else if (session) {
    outcome = await continueRegistration({ channel, sender: from, text: message, session });
  } else if (["REG", "REGISTER"].includes(keyword)) {
    outcome = farmer
      ? { reply: `Naka-register na po kayo, ${farmer.name}. I-text ang kailangan ninyo, hal. "5 sako urea".` }
      : await handleOneLineRegistration({ channel, sender: from, text: message });
  } else if (!farmer) {
    // BPMN: not registered → start the registration conversation, keeping the first text.
    saveSession(channel, from, { step: "name", data: {}, pending_message: message });
    outcome = {
      reply: "Welcome sa AgriConnect! Para maipadala namin ang request ninyo sa mga supplier, mag-register muna tayo. Ano po ang buong pangalan ninyo?",
      registration: "started",
    };
  } else if (channel === "messenger" && /^\d{6}$/.test(message) && hasPendingOtp(farmer.id)) {
    try {
      verifyOtp(farmer.id, message);
      outcome = { reply: "Salamat! Na-confirm na ang mobile number ninyo." };
    } catch (error) {
      outcome = { reply: otpErrorText(error) };
    }
  } else if (["STATUS", "ESTADO"].includes(keyword)) {
    outcome = { reply: statusReply(farmer) };
  } else if (farmer.verification_status === "rejected") {
    outcome = { reply: "Hindi pa aprubado ang profile ninyo. Makipag-ugnayan sa inyong barangay o kooperatiba." };
  } else {
    const open = findOpenInbound(farmer.id);
    if (open?.status === "awaiting_confirmation" && YES.test(message)) {
      outcome = await publishInbound(open.id, { confirmed_by: "farmer" });
    } else if (open?.status === "awaiting_confirmation" && NO.test(message) && message.split(/\s+/).length <= 3) {
      getDb().prepare("UPDATE inbound_messages SET status = 'needs_info', updated_at = datetime('now') WHERE id = ?").run(open.id);
      const language = decodeRow(open).extraction?.language || detectLanguage(message.toLowerCase().split(/\W+/));
      outcome = {
        reply: pick(language, {
          tagalog: "Sige po. I-text ang tamang detalye (produkto, dami, kailan kailangan).",
          bisaya: "Sige. I-text ang saktong detalye (produkto, gidaghanon, kanus-a kinahanglan).",
          english: "Okay. Text the correct details (product, quantity, when you need it).",
        }),
        inbound: getInbound(open.id),
      };
    } else {
      outcome = await processOrderText({ farmer, channel, sender: from, text: message, open });
    }
  }

  farmer = outcome?.farmer || farmer || findFarmer(channel, from);
  const reply = await sendToChannel({ channel, to: from, body: outcome.reply, farmer_id: farmer?.id ?? null });
  if (outcome.inbound) notifyStaff("inbound", { id: outcome.inbound.id, status: outcome.inbound.status });

  return {
    reply,
    farmer: farmer || null,
    inbound: outcome.inbound || null,
    requests: outcome.requests || [],
    extraction: outcome.extraction || null,
    registration: outcome.registration || null,
  };
}

// ---------- Staff inbox ----------

function listInbound({ channel, status } = {}) {
  const clauses = [];
  const params = [];
  if (CHANNELS.includes(channel)) {
    clauses.push("im.channel = ?");
    params.push(channel);
  }
  if (status) {
    clauses.push("im.status = ?");
    params.push(status);
  }
  const rows = getDb()
    .prepare(
      `SELECT im.*, f.name AS farmer_name, f.barangay AS farmer_barangay, f.municipality AS farmer_municipality,
              f.phone_number AS farmer_phone, f.verification_status AS farmer_verification
       FROM inbound_messages im LEFT JOIN farmers f ON f.id = im.farmer_id
       ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
       ORDER BY CASE WHEN im.status IN ('new', 'needs_info', 'awaiting_confirmation') THEN 0 ELSE 1 END, im.updated_at DESC
       LIMIT 200`
    )
    .all(...params)
    .map(decodeRow);
  const counts = getDb().prepare("SELECT channel, COUNT(*) AS n FROM inbound_messages WHERE status IN ('new','needs_info','awaiting_confirmation') GROUP BY channel").all();
  return { items: rows, open_counts: Object.fromEntries(counts.map((c) => [c.channel, c.n])) };
}

/** Staff "Process": re-read the message with the NLP service (no reply is sent). */
async function reprocessInbound(id) {
  const row = getInbound(id);
  if (!OPEN_STATUSES.includes(row.status)) throw badRequest(`This message is already ${row.status}`);
  const extraction = await extractFarmInputRequest(row.body, { profileBarangay: row.farmer_barangay });
  const structured = toStructured(extraction);
  const status = missingQuestion(structured) ? "needs_info" : row.status === "new" ? "awaiting_confirmation" : row.status;
  getDb()
    .prepare("UPDATE inbound_messages SET extraction = ?, status = ?, updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(structured), status, id);
  return getInbound(id);
}

/** Staff "Publish Request" (assisted mode): publish and text the farmer the confirmation. */
async function staffPublishInbound(id, overrides) {
  const result = await publishInbound(id, { confirmed_by: "staff", overrides });
  const row = result.inbound;
  await sendToChannel({ channel: row.channel, to: row.sender, body: result.reply, farmer_id: row.farmer_id });
  return result;
}

function dismissInbound(id) {
  const row = getInbound(id);
  if (row.status === "published") throw badRequest("This message was already published");
  getDb().prepare("UPDATE inbound_messages SET status = 'dismissed', updated_at = datetime('now') WHERE id = ?").run(id);
  return getInbound(id);
}

module.exports = {
  handleInbound,
  listInbound,
  getInbound,
  reprocessInbound,
  staffPublishInbound,
  dismissInbound,
};
