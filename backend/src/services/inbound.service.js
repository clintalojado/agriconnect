// Farmer texts arriving by SMS or Messenger — BPMN phases 1 and 2:
//   unknown sender → registration conversation (→ OTP for Messenger phone numbers)
//   registered     → AI reads the text into a structured request (possibly
//                    several products) → farmer confirms by replying OO/YES
//                    (or staff confirms for them) → requests are stored.
// Every order-type text is also kept in the staff inbox (inbound_messages).
// Replies follow the farmer's language (nlp/language identifies it; short
// texts keep the language the sender last wrote in).

const { getDb } = require("../db/connection");
const { extractFarmInputRequest } = require("./nlp.service");
const { identifyLanguage } = require("./nlp/language");
const { extractWithRules } = require("./nlp/rules");
const { say } = require("./nlp/i18n");
const { describeOrder } = require("./nlp/replies");
const { classifyIntent } = require("./nlp/intent");
const { answerIntent, fallbackReply, KB_INTENTS } = require("./nlp/knowledge");
const { productPrices } = require("./nlp/prices");
const {
  findOrCreateFarmer,
  findFarmerByPhone,
  findFarmerByMessengerId,
  findFarmerByWebId,
  hasPendingOtp,
  verifyOtp,
} = require("./farmers.service");
const { createStructuredRequest, getRequestsByFarmer } = require("./requests.service");
const { findProductByName } = require("./catalog.service");
const { sendToChannel, sendCards, logInbound, CHANNELS } = require("./sms.service");
const { notifyStaff } = require("./notifications.service");
const { sendOtp } = require("./verification.service");
const { normalizePhone } = require("../utils/phone");
const { canonicalBarangay, findBarangayInText } = require("./locations");
const { badRequest, notFound } = require("../utils/errors");

// Yes/no in each language: oo/opo, huo (Hiligaynon), wen (Ilocano), iyo (Bikol),
// uway (Maguindanaon), on (Pangasinan), wa (Kapampangan); hindi/dili/indi,
// saan/haan (Ilocano), dai (Bikol), diri (Waray), ali (Kapampangan), andi (Pangasinan).
const YES = /^\s*(oo|opo|o-o|yes|y|ok|okay|oks|sige|confirm|kumpirma|tama|husto|sakto|go|huo|hu-o|wen|iyo|uway|oway)\b/i;
const NO = /^\s*(no|hindi|dili|indi|dai|haan|bako|mali|sala|sayop|biddut|cancel|ulitin|usbon)\b/i;
// Words that mean yes/no only when they are the whole reply ("saan" is also
// Tagalog for "where", "diri" Bisaya for "here").
const YES_ALONE = /^\s*(on|wa)\s*(po|pu|apo)?\s*[.!]*\s*$/i;
const NO_ALONE = /^\s*(saan|diri|dire|ali|andi|aliwa)\s*(po|pu|apo)?\s*[.!]*\s*$/i;
const SKIP = /^\s*(skip|wala|awan|waay|none)\s*$/i;
const isYes = (text) => YES.test(text) || YES_ALONE.test(text);
const isNo = (text) => NO.test(text) || NO_ALONE.test(text);

const OPEN_STATUSES = ["new", "needs_info", "awaiting_confirmation"];
const FIELDS = ["product_name", "quantity", "unit", "barangay", "preferred_date"];

const LANGUAGES_OK = " (Tagalog, Bisaya, Hiligaynon, Ilocano, English OK)";

function helpText(language) {
  return (
    say(language, {
      tl: 'AgriConnect: I-text ang kailangan mo, hal. "5 sako urea at 2 sako 14-14-14, next week". STATUS - tingnan ang mga request. REG Pangalan, Barangay, Bayan - mag-register.',
      bis: 'AgriConnect: I-text ang imong kinahanglan, pananglitan "5 ka sako urea ug 2 ka sako 14-14-14, sunod semana". STATUS - tan-awa ang mga request. REG Ngalan, Barangay, Lungsod - mag-register.',
      hil: 'AgriConnect: I-text ang inyo kinahanglan, pareho sang "5 ka sako urea kag 2 ka sako 14-14-14, masunod nga semana". STATUS - tan-awa ang mga request. REG Ngalan, Barangay, Banwa - magparehistro.',
      ilo: 'AgriConnect: I-text ti kasapulanyo, kas iti "5 a sako nga urea ken 2 a sako a 14-14-14, inton sumaruno a lawas". STATUS - kitaen dagiti request. REG Nagan, Barangay, Ili - agparehistro.',
      en: 'AgriConnect: Text what you need, e.g. "5 sacks urea and 2 sacks 14-14-14, next week". STATUS - see your requests. REG Name, Barangay, Town - register.',
    }) + LANGUAGES_OK
  );
}

// ---------- Language of the conversation ----------

function rememberedLanguage(channel, sender) {
  return getDb().prepare("SELECT language FROM chat_languages WHERE channel = ? AND sender = ?").get(channel, sender)?.language || null;
}

function rememberLanguage(channel, sender, language) {
  getDb()
    .prepare(
      `INSERT INTO chat_languages (channel, sender, language, updated_at) VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT (channel, sender) DO UPDATE SET language = excluded.language, updated_at = excluded.updated_at`
    )
    .run(channel, sender, language);
}

/**
 * The language to answer this message in. A message with words specific to
 * one language sets it; short or neutral texts ("OO", "5 sako urea", a name)
 * keep the sender's last language. Switching away from a known language takes
 * two such words, so one borrowed word ("po", "gid") doesn't flip the reply.
 */
function conversationLanguage(channel, sender, text) {
  const detected = identifyLanguage(text);
  const remembered = rememberedLanguage(channel, sender);
  const switches = detected.confident && (!remembered || remembered === detected.language || detected.evidence.length >= 2);
  if (switches) {
    if (detected.language !== remembered) rememberLanguage(channel, sender, detected.language);
    return detected.language;
  }
  if (remembered) return remembered;
  return detected.evidence.length ? detected.language : "tagalog";
}

// ---------- Helpers ----------

function findFarmer(channel, sender) {
  if (channel === "sms") return findFarmerByPhone(sender);
  if (channel === "web") return findFarmerByWebId(sender);
  return findFarmerByMessengerId(sender);
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
    return say(language, {
      tl: "Anong produkto po ang kailangan ninyo? (hal. urea, 14-14-14, binhi ng mais)",
      bis: "Unsa nga produkto ang imong kinahanglan? (pananglitan urea, 14-14-14, liso sa mais)",
      hil: "Ano nga produkto ang kinahanglan ninyo? (pareho sang urea, 14-14-14, binhi sang mais)",
      ilo: "Ania a produkto ti kasapulanyo? (kas iti urea, 14-14-14, bukel ti mais)",
      en: "Which product do you need? (e.g. urea, 14-14-14, corn seeds)",
    });
  }
  const item = structured.items.find((i) => i.quantity == null || !i.unit);
  if (!item) return null;
  const p = item.product_name;
  return say(language, {
    tl: `Ilang sako, kilo, o litro po ng ${p}?`,
    bis: `Pila ka sako, kilo, o litro sa ${p}?`,
    hil: `Pila ka sako, kilo, ukon litro sang ${p}?`,
    ilo: `Mano a sako, kilo, wenno litro ti ${p}?`,
    en: `How many sacks, kilos, or liters of ${p}?`,
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
  const items = itemLines(structured.items);
  return say(structured.language, {
    tl: `Paki-confirm po ang request ninyo:\n${items}\n${where}${when ? ` · kailangan ${when}` : ""}\nI-reply ang OO para i-confirm, o i-text ang tamang detalye.`,
    bis: `Palihug i-confirm ang imong request:\n${items}\n${where}${when ? ` · kinahanglan ${when}` : ""}\nI-reply ang OO aron i-confirm, o i-text ang saktong detalye.`,
    hil: `Palihog i-confirm ang inyo request:\n${items}\n${where}${when ? ` · kinahanglan ${when}` : ""}\nI-reply ang OO para i-confirm, ukon i-text ang husto nga detalye.`,
    ilo: `Pangngaasiyo ta i-confirm ti requestyo:\n${items}\n${where}${when ? ` · kasapulan ${when}` : ""}\nI-reply ti WEN tapno ma-confirm, wenno i-text ti husto a detalye.`,
    en: `Please confirm your request:\n${items}\n${where}${when ? ` · needed ${when}` : ""}\nReply YES to confirm, or text the correct details.`,
  });
}

function publishedReply(language, items, farmer) {
  const held = farmer.verification_status !== "verified";
  const lines = itemLines(items);
  return say(language, {
    tl:
      `Salamat! Na-record na ang request ninyo sa AgriConnect:\n${lines}\n` +
      (held
        ? "Ipapadala ito sa mga supplier kapag na-verify na ng barangay ang profile ninyo."
        : "Ipapadala namin sa inyo ang mga quote ng supplier."),
    bis:
      `Salamat! Na-record na ang imong request sa AgriConnect:\n${lines}\n` +
      (held
        ? "Ipadala kini sa mga supplier kung ma-verify na sa barangay ang imong profile."
        : "Ipadala namo kanimo ang mga quote gikan sa supplier."),
    hil:
      `Salamat! Na-record na ang inyo request sa AgriConnect:\n${lines}\n` +
      (held
        ? "Ipadala ini sa mga supplier kon ma-verify na sang barangay ang inyo profile."
        : "Ipadala namon sa inyo ang mga quote sang supplier."),
    ilo:
      `Agyamanak! Nailista ti requestyo iti AgriConnect:\n${lines}\n` +
      (held
        ? "Maipatulod daytoy kadagiti supplier no ma-verify ti barangay ti profileyo."
        : "Ipatulodmi kadakayo dagiti quote ti supplier."),
    en:
      `Thanks! Your request is recorded in AgriConnect:\n${lines}\n` +
      (held ? "It goes to suppliers once your barangay verifies your profile." : "We'll send you the suppliers' quotations."),
  });
}

// "Magkano ang urea?": every store's price and who delivers to the farmer's
// barangay (the barangay in the message, else their own). { reply, cards, cardsReply }
function priceAnswer(structured, farmer) {
  return productPrices(structured.items[0]?.product_name, {
    language: structured.language,
    barangay: structured.barangay || farmer.barangay,
  });
}

// Request statuses as the farmer reads them: [tl, bis, hil, ilo, en].
const STATUS_LABEL = {
  draft: ["draft", "draft", "draft", "draft", "draft"],
  awaiting_verification: ["hinihintay ang verification", "naghulat sa verification", "ginahulat ang verification", "ur-urayen ti verification", "waiting for verification"],
  for_quotation: ["naghihintay ng quote", "naghulat og quote", "ginahulat ang quote", "ur-urayen ti quote", "waiting for quotes"],
  supplier_confirmed: ["kumpirmado ng supplier", "kumpirmado sa supplier", "kumpirmado sang supplier", "kinumpirma ti supplier", "confirmed by supplier"],
  for_delivery: ["ide-deliver na", "ihatod na", "ihatod na", "maitulodton", "out for delivery"],
  delivered: ["na-deliver na", "nahatod na", "nahatod na", "naitulodon", "delivered"],
  completed: ["tapos na", "nahuman na", "natapos na", "nalpasen", "completed"],
  rejected: ["hindi tinanggap", "wala gidawat", "wala ginbaton", "saan a naawat", "rejected"],
};

function statusLabel(status, language) {
  const labels = STATUS_LABEL[status];
  if (!labels) return status;
  const [tl, bis, hil, ilo, en] = labels;
  return say(language, { tl, bis, hil, ilo, en });
}

function statusReply(farmer, language) {
  const rows = getRequestsByFarmer(farmer.id).filter((r) => r.status !== "pending_validation").slice(0, 4);
  if (rows.length === 0) {
    return say(language, {
      tl: 'Wala ka pang request. I-text ang kailangan mo, hal. "5 sako urea".',
      bis: 'Wala pa kay request. I-text ang imong kinahanglan, pananglitan "5 ka sako urea".',
      hil: 'Wala pa kamo request. I-text ang inyo kinahanglan, pareho sang "5 ka sako urea".',
      ilo: 'Awan pay ti requestyo. I-text ti kasapulanyo, kas iti "5 a sako nga urea".',
      en: 'You have no requests yet. Text what you need, e.g. "5 sacks urea".',
    });
  }
  const lines = rows.map((r) => {
    const quotes = r.display_status === "for_quotation" && r.quote_count ? `, ${r.quote_count} quote` : "";
    return `#${r.id} ${describeOrder(r)} - ${statusLabel(r.display_status, language)}${quotes}`;
  });
  const header = say(language, { tl: "Mga request mo:", bis: "Imong mga request:", hil: "Inyo mga request:", ilo: "Dagiti requestyo:", en: "Your requests:" });
  return `${header}\n${lines.join("\n")}`;
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

// Questions a not-yet-registered sender can get answered right away. Anything
// else (an order, a greeting, text we don't understand) starts registration.
const GUEST_INTENTS = new Set([
  "how_to_order", "delivery_area", "payment", "hours", "location", "about", "suppliers",
  "farming_advice", "price", "availability", "points", "registration_help",
]);

function isGuestQuestion(text) {
  if (mentionsOrder(text) && !/\?|magkano|magkanu|pila|tagpila|tagpira|mano|pigara|how much|presyo|price/i.test(text)) return false;
  const ml = classifyIntent(text);
  return ml.understood && GUEST_INTENTS.has(ml.intent);
}

// Intents that win over the order parser even when the text mentions sacks
// ("kulang ng 2 sako ang deliver" is a complaint, not an order).
const OVERRIDE_INTENTS = new Set(["complaint", "cancel_order", "order_status", "talk_to_human"]);

// Adds text after a reply, and after the short Messenger text that goes with cards.
function withSuffix(outcome, suffix) {
  return {
    ...outcome,
    reply: outcome.reply + suffix,
    ...(outcome.cardsReply ? { cardsReply: outcome.cardsReply + suffix } : {}),
  };
}

/**
 * Answers a question from the knowledge base as its own inbox entry, leaving
 * any open order conversation untouched. Complaints, cancellations, requests
 * for a person, and messages the bot didn't understand are left "new" so
 * staff see them.
 */
function answerFromKnowledge({ farmer, channel, sender, text, ml, language }) {
  const answer = ml.understood
    ? answerIntent(ml.intent, { text, language, farmer, statusReply })
    : { reply: fallbackReply(language), escalate: true };
  const inbound = saveInbound({
    channel,
    sender,
    farmer_id: farmer?.id ?? null,
    body: text,
    structured: { items: [], intent: ml.intent, language, source: "ml", confidence: ml.confidence, ml },
    status: answer.escalate ? "new" : "answered",
  });
  return { inbound, reply: answer.reply, cards: answer.cards, cardsReply: answer.cardsReply, intent: ml };
}

async function processOrderText({ farmer, channel, sender, text, open, language }) {
  const merging = open && ["needs_info", "awaiting_confirmation"].includes(open.status);
  const body = merging ? `${open.body}\n${text}` : text;
  const extraction = await extractFarmInputRequest(body, { profileBarangay: farmer.barangay });
  // Replies follow the conversation's language, not just this one text.
  const structured = { ...toStructured(extraction), language };
  // The ML intent model reads only the new text, not the merged conversation.
  const ml = classifyIntent(text);
  const hasProduct = structured.items.length > 0;
  const hasQuantity = structured.items.some((i) => i.quantity != null);

  // Mid-order, a text that states a quantity ("tallo a sako laeng") is a
  // correction to the order, not a complaint or cancellation. With one
  // product on the order, the new quantity replaces the old one.
  const fix = merging ? extractWithRules(text) : null;
  const correction = fix?.quantity != null;
  const previousItems = merging ? decodeRow(open).extraction?.items || [] : [];
  if (correction && !fix.product_name && previousItems.length === 1) {
    structured.items = [{ ...previousItems[0], quantity: fix.quantity, unit: fix.unit || previousItems[0].unit }];
  }
  if (ml.understood && OVERRIDE_INTENTS.has(ml.intent) && ml.confidence >= 0.45 && !correction) {
    return { ...answerFromKnowledge({ farmer, channel, sender, text, ml, language }), extraction };
  }
  // A question in the middle of an order ("magkano delivery?", "magkano ang
  // urea?" before OO): answer it and remind the farmer about the pending
  // order, without merging.
  const questionIntent = ml.understood && KB_INTENTS.has(ml.intent) && !["order", "acknowledge"].includes(ml.intent);
  const priceQuestion = ["price", "availability"].includes(ml.intent) && !correction;
  if (merging && questionIntent && (!mentionsOrder(text) || priceQuestion)) {
    const answered = answerFromKnowledge({ farmer, channel, sender, text, ml, language });
    const reminder = open.status === "awaiting_confirmation"
      ? say(language, {
          tl: "\n\nPaalala: i-reply ang OO para i-confirm ang order ninyo.",
          bis: "\n\nPahinumdom: i-reply ang OO aron i-confirm ang imong order.",
          hil: "\n\nPahanumdom: i-reply ang OO para i-confirm ang inyo order.",
          ilo: "\n\nPalagip: i-reply ti WEN tapno ma-confirm ti orderyo.",
          en: "\n\nReminder: reply YES to confirm your order.",
        })
      : `\n\n${missingQuestion({ items: [], ...decodeRow(open).extraction, language }) || ""}`.trimEnd();
    return { ...withSuffix(answered, reminder), extraction };
  }

  let status;
  let reply;
  const advisory = ml.understood && KB_INTENTS.has(ml.intent) && !["price", "availability", "order"].includes(ml.intent);
  if (hasProduct && !hasQuantity && !advisory && (["price", "availability"].includes(ml.intent) || structured.intent === "inquiry")) {
    // A price question is its own inbox entry; an open order stays as it was.
    const asked = merging ? toStructured(await extractFarmInputRequest(text, { profileBarangay: farmer.barangay })) : structured;
    const prices = priceAnswer({ ...asked, items: asked.items.length ? asked.items : structured.items, language }, farmer);
    const inbound = saveInbound({ channel, sender, farmer_id: farmer.id, body: text, structured: { ...asked, language }, status: "answered" });
    return { inbound, ...prices, extraction };
  } else if (!hasQuantity && ml.understood && KB_INTENTS.has(ml.intent) && !(hasProduct && ml.intent === "order")) {
    return { ...answerFromKnowledge({ farmer, channel, sender, text, ml, language }), extraction };
  } else if (!hasProduct && structured.intent !== "purchase_request" && ml.intent !== "order") {
    if (merging) {
      // Mid-order and we can't tell what this is: repeat the open question.
      status = open.status;
      reply = missingQuestion(structured) || confirmationPrompt(structured, farmer);
    } else {
      return { ...answerFromKnowledge({ farmer, channel, sender, text, ml: { ...ml, understood: false }, language }), extraction };
    }
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
function otpErrorText(error, language) {
  if (/expired/i.test(error.message)) {
    return say(language, { tl: "Expired na ang code.", bis: "Expired na ang code.", hil: "Expired na ang code.", ilo: "Expired ti code.", en: "The code has expired." });
  }
  if (/too many/i.test(error.message)) {
    return say(language, {
      tl: "Masyadong maraming maling subok. Maaari ninyong i-confirm ang number mamaya sa AgriConnect app.",
      bis: "Daghan na kaayong sayop nga sulay. Pwede nimo i-confirm ang number unya sa AgriConnect app.",
      hil: "Madamo na gid nga sala nga tilaw. Pwede ninyo i-confirm ang number sa ulihi sa AgriConnect app.",
      ilo: "Adu unayen ti biddut a padas. Mabalinyo nga i-confirm ti number no madamdama iti AgriConnect app.",
      en: "Too many wrong tries. You can confirm the number later in the AgriConnect app.",
    });
  }
  return say(language, { tl: "Mali ang code.", bis: "Sayop ang code.", hil: "Sala ang code.", ilo: "Biddut ti code.", en: "Wrong code." });
}

// The registration questions in each language.
const REG = {
  askName: {
    tl: "Ano po ang buong pangalan ninyo?",
    bis: "Unsa ang imong tibuok nga ngalan?",
    hil: "Ano ang inyo bug-os nga ngalan?",
    ilo: "Ania ti naan-anay a naganyo?",
    en: "What is your full name?",
  },
  askBarangay: {
    tl: "Saang barangay po kayo nakatira? (hal. Katipunan)",
    bis: "Asa nga barangay ka nagpuyo? (pananglitan Katipunan)",
    hil: "Diin nga barangay kamo nagaistar? (pareho sang Katipunan)",
    ilo: "Ania a barangay ti pagnanaedanyo? (kas iti Katipunan)",
    en: "Which barangay do you live in? (e.g. Katipunan)",
  },
  askTown: {
    tl: "Saang bayan o munisipyo po? (hal. M'lang)",
    bis: "Asa nga lungsod o munisipyo? (pananglitan M'lang)",
    hil: "Diin nga banwa ukon munisipyo? (pareho sang M'lang)",
    ilo: "Ania nga ili wenno munisipio? (kas iti M'lang)",
    en: "Which town or municipality? (e.g. M'lang)",
  },
  askPhone: {
    tl: "Ano po ang mobile number ninyo? Dito namin ite-text ang mga update. (I-reply ang SKIP kung wala)",
    bis: "Unsa ang imong mobile number? Diri namo i-text ang mga update. (I-reply ang SKIP kung wala)",
    hil: "Ano ang inyo mobile number? Diri namon i-text ang mga update. (I-reply ang SKIP kon wala)",
    ilo: "Ania ti mobile numberyo? Ditoy ti pangi-textmi kadagiti update. (I-reply ti SKIP no awan)",
    en: "What's your mobile number? We'll text updates there. (Reply SKIP if you have none)",
  },
  badPhone: {
    tl: "Mukhang mali ang number. I-text ang 11-digit na number (hal. 09171234567) o SKIP.",
    bis: "Murag sayop ang number. I-text ang 11-digit nga number (pananglitan 09171234567) o SKIP.",
    hil: "Daw sala ang number. I-text ang 11-digit nga number (pareho sang 09171234567) ukon SKIP.",
    ilo: "Kasla biddut ti number. I-text ti 11-digit a number (kas iti 09171234567) wenno SKIP.",
    en: "That number doesn't look right. Text an 11-digit number (e.g. 09171234567) or SKIP.",
  },
  orderKept: {
    tl: "Natanggap namin ang order ninyo — ipoproseso namin ito pagkatapos mag-register.",
    bis: "Nadawat namo ang imong order — among iproseso human ka ma-register.",
    hil: "Nabaton namon ang inyo order — iproseso namon ini pagkatapos kamo magparehistro.",
    ilo: "Naawatmi ti orderyo — iprosesomi daytoy kalpasan ti panagrehistroyo.",
    en: "We got your order — we'll process it once you're registered.",
  },
  yesOrNo: {
    tl: "I-reply ang OO kung tama ang detalye, o MALI para ulitin.",
    bis: "I-reply ang OO kung sakto ang detalye, o MALI aron usbon.",
    hil: "I-reply ang OO kon husto ang detalye, ukon INDI para ulihon.",
    ilo: "I-reply ti WEN no husto ti detalye, wenno SAAN tapno ulitenmi.",
    en: "Reply YES if the details are correct, or NO to start over.",
  },
  startOver: {
    tl: "Sige po, ulitin natin.",
    bis: "Sige, usbon nato.",
    hil: "Sige, ulihon naton.",
    ilo: "Sige, ulitentayo.",
    en: "Okay, let's start over.",
  },
  otpRetry: {
    tl: "I-reply ang tamang code, o SKIP.",
    bis: "I-reply ang saktong code, o SKIP.",
    hil: "I-reply ang husto nga code, ukon SKIP.",
    ilo: "I-reply ti husto a code, wenno SKIP.",
    en: "Reply with the correct code, or SKIP.",
  },
  registerAgain: {
    tl: "Paki-ulit ang registration. I-text ang REG.",
    bis: "Palihug usba ang registration. I-text ang REG.",
    hil: "Palihog ulihon ang registration. I-text ang REG.",
    ilo: "Pangngaasiyo ta ulitenyo ti registration. I-text ti REG.",
    en: "Please register again. Text REG.",
  },
};

function askBarangay(name, language) {
  return say(language, {
    tl: `Salamat, ${name}! Saang barangay po kayo nakatira?`,
    bis: `Salamat, ${name}! Asa nga barangay ka nagpuyo?`,
    hil: `Salamat, ${name}! Diin nga barangay kamo nagaistar?`,
    ilo: `Agyamanak, ${name}! Ania a barangay ti pagnanaedanyo?`,
    en: `Thanks, ${name}! Which barangay do you live in?`,
  });
}

function otpSentText(phone, language) {
  return say(language, {
    tl: `Nagpadala kami ng 6-digit code sa ${phone}. I-reply dito ang code para ma-confirm ang number (o SKIP).`,
    bis: `Nagpadala mi og 6-digit code sa ${phone}. I-reply diri ang code aron ma-confirm ang number (o SKIP).`,
    hil: `Nagpadala kami sang 6-digit code sa ${phone}. I-reply diri ang code para ma-confirm ang number (ukon SKIP).`,
    ilo: `Nangipatulodkami iti 6-digit a code iti ${phone}. I-reply ditoy ti code tapno ma-confirm ti number (wenno SKIP).`,
    en: `We sent a 6-digit code to ${phone}. Reply with the code here to confirm the number (or SKIP).`,
  });
}

function confirmRegistration(data, language) {
  const [name, town] = say(language, {
    tl: ["Pangalan", "Bayan"], bis: ["Ngalan", "Lungsod"], hil: ["Ngalan", "Banwa"], ilo: ["Nagan", "Ili"], en: ["Name", "Town"],
  });
  const summary = `${name}: ${data.name}\nBarangay: ${data.barangay}\n${town}: ${data.municipality}${data.phone ? `\nMobile: ${data.phone}` : ""}`;
  return say(language, {
    tl: `Pakicheck po:\n${summary}\nI-reply ang OO kung tama, o MALI para ulitin.`,
    bis: `Palihug susiha:\n${summary}\nI-reply ang OO kung sakto, o MALI aron usbon.`,
    hil: `Palihog usisa:\n${summary}\nI-reply ang OO kon husto, ukon INDI para ulihon.`,
    ilo: `Pangngaasiyo ta kitaenyo:\n${summary}\nI-reply ti WEN no husto, wenno SAAN tapno ulitenmi.`,
    en: `Please check:\n${summary}\nReply YES if correct, or NO to start over.`,
  });
}

// Stricter than looksLikeOrder: registration answers may contain numbers
// ("Poblacion 2", "Zone 3"), so only quantities with units or product words count.
function mentionsOrder(text) {
  return /\b\d+\s*(sa+k[ou]|sacks?|bags?|kilos?|kg|litro|liters?|bote|botelya|bottles?)\b|urea|abono|fertili|binhi|liso\b|bukel|seeds?\b|feeds?\b|pabili|palit|bakal|gatang|saliw|order/i.test(text || "");
}

function looksLikeOrder(text) {
  return /\d|sako|sack|kilo|kg|litro|urea|abono|fertili|binhi|liso|bukel|seed|feed|pakain|order|palit|bili|bakal|gatang|saliw/i.test(text || "");
}

/** Completes registration; processes the farmer's first text if it was an order. */
async function finishRegistration({ channel, sender, farmer, session, language }) {
  endSession(channel, sender);
  const name = farmer.name;
  let reply = say(language, {
    tl: `Salamat, ${name}! Naka-register na kayo sa AgriConnect.`,
    bis: `Salamat, ${name}! Naka-register na ka sa AgriConnect.`,
    hil: `Salamat, ${name}! Naka-register na kamo sa AgriConnect.`,
    ilo: `Agyamanak, ${name}! Nakarehistro kayon iti AgriConnect.`,
    en: `Thanks, ${name}! You're registered with AgriConnect.`,
  });
  if (farmer.verification_status !== "verified") {
    reply += say(language, {
      tl: " Ive-verify ng inyong barangay/kooperatiba ang profile ninyo.",
      bis: " I-verify sa inyong barangay/kooperatiba ang imong profile.",
      hil: " I-verify sang inyo barangay/kooperatiba ang inyo profile.",
      ilo: " I-verify ti barangay/kooperatibayo ti profileyo.",
      en: " Your barangay/cooperative will verify your profile.",
    });
  }
  let outcome = {};
  if (session?.pending_message && looksLikeOrder(session.pending_message)) {
    outcome = await processOrderText({ farmer, channel, sender, text: session.pending_message, open: null, language });
    reply += `\n\n${outcome.reply}`;
  } else {
    reply += say(language, {
      tl: ' I-text na ang kailangan ninyo, hal. "5 sako urea".',
      bis: ' I-text na ang imong kinahanglan, pananglitan "5 ka sako urea".',
      hil: ' I-text na ang inyo kinahanglan, pareho sang "5 ka sako urea".',
      ilo: ' I-text ti kasapulanyo, kas iti "5 a sako nga urea".',
      en: ' Text what you need, e.g. "5 sacks urea".',
    });
  }
  return { ...outcome, farmer, reply, registration: "completed" };
}

async function createRegisteredFarmer({ channel, sender, data, language }) {
  const created = findOrCreateFarmer({
    name: data.name,
    barangay: data.barangay,
    municipality: data.municipality,
    // An SMS registration proves the number it came from.
    phone_number: channel === "sms" ? sender : data.phone || null,
    phone_verified: channel === "sms",
    messenger_psid: channel === "messenger" ? sender : null,
    web_chat_id: channel === "web" ? sender : null,
  });
  // Texts sent later (OTP, quotes, verification) go out in this language.
  getDb().prepare("UPDATE farmers SET language = ? WHERE id = ?").run(language, created.id);
  const farmer = { ...created, language };
  notifyStaff("verification", { farmer_id: farmer.id, status: farmer.verification_status });
  return farmer;
}

/** Handles the reply to the current registration question and asks the next one. */
async function continueRegistration({ channel, sender, text, session, language }) {
  const data = { ...session.data };
  const answer = text.trim();

  // An order sent mid-registration ("5 sako urea") is kept for after sign-up,
  // and the question is asked again instead of saving the order as a name/place.
  const askAgain = (question) => {
    const pending = [session.pending_message, answer].filter((m) => m && mentionsOrder(m)).join("\n");
    saveSession(channel, sender, { step: session.step, data, pending_message: pending || answer });
    return { reply: `${say(language, REG.orderKept)} ${say(language, question)}`, registration: "in_progress" };
  };

  switch (session.step) {
    case "name":
      if (mentionsOrder(answer)) return askAgain(REG.askName);
      data.name = answer.slice(0, 80);
      saveSession(channel, sender, { step: "barangay", data });
      return { reply: askBarangay(data.name, language), registration: "in_progress" };
    case "barangay": {
      // A known M'lang barangay anywhere in the answer wins ("sa new rizal po" → New Rizal).
      const known = findBarangayInText(answer);
      if (!known && mentionsOrder(answer)) return askAgain(REG.askBarangay);
      data.barangay = known || canonicalBarangay(answer.replace(/^(brgy\.?|barangay)\s+/i, "").slice(0, 80));
      saveSession(channel, sender, { step: "municipality", data });
      return { reply: say(language, REG.askTown), registration: "in_progress" };
    }
    case "municipality":
      if (mentionsOrder(answer)) return askAgain(REG.askTown);
      data.municipality = answer.slice(0, 80);
      if (channel === "messenger") {
        saveSession(channel, sender, { step: "phone", data });
        return { reply: say(language, REG.askPhone), registration: "in_progress" };
      }
      saveSession(channel, sender, { step: "confirm", data });
      return { reply: confirmRegistration(data, language), registration: "in_progress" };
    case "phone": {
      if (!SKIP.test(answer)) {
        const phone = normalizePhone(answer);
        if (!phone || phone.length !== 12 || !phone.startsWith("639")) {
          return { reply: say(language, REG.badPhone), registration: "in_progress" };
        }
        data.phone = `0${phone.slice(2)}`;
      }
      saveSession(channel, sender, { step: "confirm", data });
      return { reply: confirmRegistration(data, language), registration: "in_progress" };
    }
    case "confirm": {
      if (isNo(answer)) {
        saveSession(channel, sender, { step: "name", data: {} });
        return { reply: `${say(language, REG.startOver)} ${say(language, REG.askName)}`, registration: "in_progress" };
      }
      if (!isYes(answer)) {
        return { reply: say(language, REG.yesOrNo), registration: "in_progress" };
      }
      const farmer = await createRegisteredFarmer({ channel, sender, data, language });
      if (channel === "messenger" && data.phone && !farmer.phone_verified) {
        // BPMN: prove the phone number with a one-time code before finishing.
        await sendOtp(farmer.id);
        saveSession(channel, sender, { step: "otp", data: { ...data, farmer_id: farmer.id } });
        return { farmer, reply: otpSentText(data.phone, language), registration: "otp" };
      }
      return finishRegistration({ channel, sender, farmer, session, language });
    }
    case "otp": {
      const farmer = getDb().prepare("SELECT * FROM farmers WHERE id = ?").get(data.farmer_id);
      if (!farmer) {
        endSession(channel, sender);
        return { reply: say(language, REG.registerAgain), registration: "restart" };
      }
      if (!SKIP.test(answer)) {
        try {
          verifyOtp(farmer.id, answer.replace(/\D/g, ""));
        } catch (error) {
          return { farmer, reply: `${otpErrorText(error, language)} ${say(language, REG.otpRetry)}`, registration: "otp" };
        }
      }
      const verified = getDb().prepare("SELECT * FROM farmers WHERE id = ?").get(farmer.id);
      return finishRegistration({ channel, sender, farmer: verified, session, language });
    }
    default:
      endSession(channel, sender);
      return { reply: helpText(language) };
  }
}

// `session` is set when REG arrives in the middle of the guided registration;
// its saved first message is still processed once registration completes.
async function handleOneLineRegistration({ channel, sender, text, session = null, language }) {
  const parts = text
    .replace(/^\s*(reg|register)\b[:\s]*/i, "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 3) {
    saveSession(channel, sender, { step: "name", data: {} });
    const start = say(language, { tl: "Mag-register tayo.", bis: "Mag-register ta.", hil: "Magparehistro kita.", ilo: "Agparehistro ta.", en: "Let's register you." });
    return { reply: `${start} ${say(language, REG.askName)}`, registration: "in_progress" };
  }
  const [name, barangay, municipality, phone] = parts;
  const data = {
    name,
    barangay: canonicalBarangay(barangay.replace(/^(brgy\.?|barangay)\s+/i, "")),
    municipality,
    phone: phone || null,
  };
  const farmer = await createRegisteredFarmer({ channel, sender, data, language });
  if (channel === "messenger" && data.phone && !farmer.phone_verified) {
    await sendOtp(farmer.id);
    saveSession(channel, sender, { step: "otp", data: { ...data, farmer_id: farmer.id } });
    return { farmer, reply: otpSentText(data.phone, language), registration: "otp" };
  }
  return finishRegistration({ channel, sender, farmer, session, language });
}

// ---------- Data deletion (privacy policy / Meta data-deletion requirement) ----------

const DELETE_REQUEST = /^\s*(delete my data|burahin ang (aking|akong) (data|impormasyon)|papara ang akong data)\s*[.!]*\s*$/i;
const DELETE_CONFIRM = /^\s*confirm delete\s*[.!]*\s*$/i;
const DELETE_CONFIRM_TEXT =
  "Buburahin nito ang inyong pangalan, numero, at mga mensahe sa AgriConnect. I-reply ang CONFIRM DELETE para ituloy.\n" +
  "This deletes your name, number, and messages from AgriConnect. Reply CONFIRM DELETE to continue.";

/**
 * Removes a sender's personal data: the farmer profile is anonymised (orders
 * stay for suppliers' records, without a name or contact), and their message
 * log, inbox entries, registration session, and notifications are erased.
 */
function deleteSenderData({ channel, sender, farmer }) {
  const db = getDb();
  db.exec("BEGIN");
  try {
    if (farmer) {
      db.prepare(
        `UPDATE farmers SET name = 'Deleted user', phone_number = NULL, messenger_psid = NULL, web_chat_id = NULL,
                phone_verified = 0 WHERE id = ?`
      ).run(farmer.id);
      db.prepare("UPDATE inbound_messages SET body = '[deleted]', extraction = NULL, sender = '[deleted]' WHERE farmer_id = ?").run(farmer.id);
      db.prepare("DELETE FROM sms_messages WHERE farmer_id = ?").run(farmer.id);
      db.prepare("UPDATE farm_input_requests SET raw_message = '[deleted]' WHERE farmer_id = ?").run(farmer.id);
      db.prepare("DELETE FROM notifications WHERE recipient_type = 'farmer' AND recipient_id = ?").run(farmer.id);
    }
    db.prepare("UPDATE inbound_messages SET body = '[deleted]', extraction = NULL, sender = '[deleted]' WHERE channel = ? AND sender = ?").run(channel, sender);
    db.prepare("DELETE FROM sms_messages WHERE channel = ? AND phone = ?").run(channel, sender);
    db.prepare("DELETE FROM registration_sessions WHERE channel = ? AND sender = ?").run(channel, sender);
    db.prepare("DELETE FROM chat_languages WHERE channel = ? AND sender = ?").run(channel, sender);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
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
  const language = conversationLanguage(channel, from, message);
  let outcome;

  if (["HELP", "TULONG", "TABANG", "BULIG", "TULUNG", "INFO"].includes(keyword)) {
    outcome = { reply: helpText(language) };
  } else if (DELETE_REQUEST.test(message)) {
    outcome = { reply: DELETE_CONFIRM_TEXT };
  } else if (DELETE_CONFIRM.test(message)) {
    deleteSenderData({ channel, sender: from, farmer });
    farmer = null;
    outcome = { reply: "Nabura na ang inyong personal na impormasyon sa AgriConnect. Salamat po. / Your personal data has been deleted." };
  } else if (["REG", "REGISTER"].includes(keyword) && !farmer && session && session.step !== "otp") {
    // "REG Name, Barangay, Town" in the middle of the guided questions.
    outcome = await handleOneLineRegistration({ channel, sender: from, text: message, session, language });
  } else if (session) {
    outcome = await continueRegistration({ channel, sender: from, text: message, session, language });
  } else if (["REG", "REGISTER"].includes(keyword)) {
    const name = farmer?.name;
    outcome = farmer
      ? {
          reply: say(language, {
            tl: `Naka-register na po kayo, ${name}. I-text ang kailangan ninyo, hal. "5 sako urea".`,
            bis: `Naka-register na ka, ${name}. I-text ang imong kinahanglan, pananglitan "5 ka sako urea".`,
            hil: `Naka-register na kamo, ${name}. I-text ang inyo kinahanglan, pareho sang "5 ka sako urea".`,
            ilo: `Nakarehistro kayon, ${name}. I-text ti kasapulanyo, kas iti "5 a sako nga urea".`,
            en: `You're already registered, ${name}. Text what you need, e.g. "5 sacks urea".`,
          }),
        }
      : await handleOneLineRegistration({ channel, sender: from, text: message, language });
  } else if (!farmer && isGuestQuestion(message)) {
    // A question from someone not registered yet: answer it, then invite them.
    const ml = classifyIntent(message);
    const answered = answerFromKnowledge({ farmer: null, channel, sender: from, text: message, ml, language });
    const invite = say(language, {
      tl: "Para makapag-order, mag-register muna: i-text ang REG Pangalan, Barangay, Bayan (hal. REG Juan Dela Cruz, Katipunan, M'lang).",
      bis: "Aron maka-order, pag-register una: i-text ang REG Ngalan, Barangay, Lungsod (pananglitan REG Juan Dela Cruz, Katipunan, M'lang).",
      hil: "Para makaorder, magparehistro anay: i-text ang REG Ngalan, Barangay, Banwa (pareho sang REG Juan Dela Cruz, Katipunan, M'lang).",
      ilo: "Tapno makaorder, agparehistro pay: i-text ti REG Nagan, Barangay, Ili (kas iti REG Juan Dela Cruz, Katipunan, M'lang).",
      en: "To order, register first: text REG Name, Barangay, Town (e.g. REG Juan Dela Cruz, Katipunan, M'lang).",
    });
    outcome = withSuffix(answered, `\n\n${invite}`);
  } else if (!farmer) {
    // BPMN: not registered → start the registration conversation, keeping the first text.
    saveSession(channel, from, { step: "name", data: {}, pending_message: message });
    outcome = {
      reply: say(language, {
        tl: "Welcome sa AgriConnect! Para maipadala namin ang request ninyo sa mga supplier, mag-register muna tayo. Ano po ang buong pangalan ninyo?",
        bis: "Welcome sa AgriConnect! Aron maipadala namo ang imong request sa mga supplier, mag-register sa una ta. Unsa ang imong tibuok nga ngalan?",
        hil: "Welcome sa AgriConnect! Para mapadala namon ang inyo request sa mga supplier, magparehistro anay kita. Ano ang inyo bug-os nga ngalan?",
        ilo: "Welcome iti AgriConnect! Tapno maipatulodmi ti requestyo kadagiti supplier, agparehistro ta pay. Ania ti naan-anay a naganyo?",
        en: "Welcome to AgriConnect! To send your request to suppliers, let's register you first. What is your full name?",
      }),
      registration: "started",
    };
  } else if (channel === "messenger" && /^\d{6}$/.test(message) && hasPendingOtp(farmer.id)) {
    try {
      verifyOtp(farmer.id, message);
      outcome = {
        reply: say(language, {
          tl: "Salamat! Na-confirm na ang mobile number ninyo.",
          bis: "Salamat! Na-confirm na ang imong mobile number.",
          hil: "Salamat! Na-confirm na ang inyo mobile number.",
          ilo: "Agyamanak! Na-confirm ti mobile numberyo.",
          en: "Thanks! Your mobile number is confirmed.",
        }),
      };
    } catch (error) {
      outcome = { reply: otpErrorText(error, language) };
    }
  } else if (["STATUS", "ESTADO"].includes(keyword)) {
    outcome = { reply: statusReply(farmer, language) };
  } else if (farmer.verification_status === "rejected") {
    outcome = {
      reply: say(language, {
        tl: "Hindi pa aprubado ang profile ninyo. Makipag-ugnayan sa inyong barangay o kooperatiba.",
        bis: "Wala pa naaprubahan ang imong profile. Kontaka ang inyong barangay o kooperatiba.",
        hil: "Wala pa naaprubahan ang inyo profile. Kontaka ang inyo barangay ukon kooperatiba.",
        ilo: "Saan pay a naaprobaran ti profileyo. Kontakenyo ti barangay wenno kooperatibayo.",
        en: "Your profile isn't approved yet. Please contact your barangay or cooperative.",
      }),
    };
  } else {
    const open = findOpenInbound(farmer.id);
    if (open?.status === "awaiting_confirmation" && isYes(message)) {
      outcome = await publishInbound(open.id, { confirmed_by: "farmer", overrides: { language } });
    } else if (open?.status === "awaiting_confirmation" && isNo(message) && message.split(/\s+/).length <= 3) {
      getDb().prepare("UPDATE inbound_messages SET status = 'needs_info', updated_at = datetime('now') WHERE id = ?").run(open.id);
      outcome = {
        reply: say(language, {
          tl: "Sige po. I-text ang tamang detalye (produkto, dami, kailan kailangan).",
          bis: "Sige. I-text ang saktong detalye (produkto, gidaghanon, kanus-a kinahanglan).",
          hil: "Sige. I-text ang husto nga detalye (produkto, kadamuon, san-o kinahanglan).",
          ilo: "Sige. I-text ti husto a detalye (produkto, kaadu, kaano a kasapulan).",
          en: "Okay. Text the correct details (product, quantity, when you need it).",
        }),
        inbound: getInbound(open.id),
      };
    } else {
      outcome = await processOrderText({ farmer, channel, sender: from, text: message, open, language });
    }
  }

  farmer = outcome?.farmer || farmer || findFarmer(channel, from);
  if (farmer && farmer.language !== language) {
    getDb().prepare("UPDATE farmers SET language = ? WHERE id = ?").run(language, farmer.id);
  }
  // Messenger shows prices as photo cards with a short text; SMS and the
  // website chat get the full text.
  const withCards = channel === "messenger" && outcome.cards?.length > 0;
  const body = withCards ? outcome.cardsReply || outcome.reply : outcome.reply;
  const reply = await sendToChannel({ channel, to: from, body, farmer_id: farmer?.id ?? null });
  if (withCards) await sendCards({ to: from, cards: outcome.cards, farmer_id: farmer?.id ?? null });
  if (outcome.inbound) notifyStaff("inbound", { id: outcome.inbound.id, status: outcome.inbound.status });

  return {
    reply,
    cards: withCards ? outcome.cards : [],
    farmer: farmer || null,
    inbound: outcome.inbound || null,
    requests: outcome.requests || [],
    extraction: outcome.extraction || null,
    registration: outcome.registration || null,
    language,
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
