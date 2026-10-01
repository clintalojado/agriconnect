const { getDb } = require("../db/connection");
const { participantKey, publish } = require("../realtime/hub");
const { sendSms, sendToChannel } = require("./sms.service");
const { badRequest } = require("../utils/errors");
const { money, perUnit } = require("../utils/format");
const { say } = require("./nlp/i18n");

const RECIPIENT_TYPES = ["farmer", "supplier"];
const STAFF_KEY = "staff:all";

/**
 * Text a farmer on the channel they can receive: SMS if they have a phone
 * number, else Messenger, else the website chat. `body` is a string or
 * translations { tl, bis, hil, ilo, en }, sent in the farmer's language.
 * Never throws (the transport logs failures).
 */
async function textFarmer(farmer, text, { request_id = null } = {}) {
  if (!farmer) return null;
  const body = typeof text === "string" ? text : say(farmer.language, text);
  if (farmer.phone_number) return sendSms({ to: farmer.phone_number, body, farmer_id: farmer.id, request_id });
  if (farmer.messenger_psid) {
    return sendToChannel({ channel: "messenger", to: farmer.messenger_psid, body, farmer_id: farmer.id, request_id });
  }
  if (farmer.web_chat_id) {
    return sendToChannel({ channel: "web", to: farmer.web_chat_id, body, farmer_id: farmer.id, request_id });
  }
  return null;
}

/**
 * Record a bell notification, push it live to the recipient's open tabs, and
 * optionally text them (`text`: a string, or translations for a farmer — see
 * textFarmer). Failures to text are logged, never thrown.
 */
async function notify({ recipient_type, recipient_id, kind, title, body = null, link = null, text = null }) {
  if (!RECIPIENT_TYPES.includes(recipient_type)) throw badRequest("Invalid recipient_type");
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO notifications (recipient_type, recipient_id, kind, title, body, link)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(recipient_type, recipient_id, kind, title, body, link);
  const row = db.prepare("SELECT * FROM notifications WHERE id = ?").get(result.lastInsertRowid);
  publish(participantKey(recipient_type, recipient_id), "notification", row);

  if (text) {
    try {
      if (recipient_type === "farmer") {
        await textFarmer(db.prepare("SELECT * FROM farmers WHERE id = ?").get(recipient_id), text);
      } else {
        const supplier = db.prepare("SELECT phone FROM suppliers WHERE id = ?").get(recipient_id);
        if (supplier?.phone) await sendSms({ to: supplier.phone, body: text });
      }
    } catch (error) {
      console.error(`[notify] text to ${recipient_type} ${recipient_id} failed: ${error.message}`);
    }
  }
  return row;
}

/** Push a live event to every open staff dashboard. */
function notifyStaff(event, data) {
  publish(STAFF_KEY, event, data);
}

function listNotifications({ recipient_type, recipient_id, limit = 30 }) {
  if (!RECIPIENT_TYPES.includes(recipient_type)) throw badRequest("Invalid recipient_type");
  const db = getDb();
  const items = db
    .prepare(
      `SELECT * FROM notifications WHERE recipient_type = ? AND recipient_id = ?
       ORDER BY id DESC LIMIT ?`
    )
    .all(recipient_type, recipient_id, Math.min(Number(limit) || 30, 100));
  const { unread } = db
    .prepare("SELECT COUNT(*) AS unread FROM notifications WHERE recipient_type = ? AND recipient_id = ? AND read_at IS NULL")
    .get(recipient_type, recipient_id);
  return { items, unread };
}

function markNotificationsRead({ recipient_type, recipient_id, ids }) {
  if (!RECIPIENT_TYPES.includes(recipient_type)) throw badRequest("Invalid recipient_type");
  const db = getDb();
  if (Array.isArray(ids) && ids.length) {
    const placeholders = ids.map(() => "?").join(",");
    db.prepare(
      `UPDATE notifications SET read_at = datetime('now')
       WHERE recipient_type = ? AND recipient_id = ? AND read_at IS NULL AND id IN (${placeholders})`
    ).run(recipient_type, recipient_id, ...ids.map(Number));
  } else {
    db.prepare(
      "UPDATE notifications SET read_at = datetime('now') WHERE recipient_type = ? AND recipient_id = ? AND read_at IS NULL"
    ).run(recipient_type, recipient_id);
  }
  return listNotifications({ recipient_type, recipient_id });
}

/**
 * Pooled-demand offers: tell every verified farmer with an open request for
 * the same product and barangay.
 */
async function notifyFarmersOfOffer(offerId) {
  const db = getDb();
  const offer = db
    .prepare(
      `SELECT so.*, ad.product_name, ad.barangay, ad.unit AS demand_unit, s.name AS supplier_name
       FROM supplier_offers so
       JOIN aggregated_demand ad ON ad.id = so.aggregated_demand_id
       JOIN suppliers s ON s.id = so.supplier_id
       WHERE so.id = ?`
    )
    .get(offerId);
  if (!offer) return { notified: 0 };

  const farmers = db
    .prepare(
      `SELECT f.id, MAX(fir.id) AS request_id
       FROM farm_input_requests fir
       JOIN farmers f ON f.id = fir.farmer_id
       WHERE fir.product_name = ? AND fir.barangay = ? AND fir.status IN ('validated', 'aggregated')
       GROUP BY f.id`
    )
    .all(offer.product_name, offer.barangay);

  const price = `${money(offer.price_per_unit)}/${perUnit(offer.demand_unit)}`;
  const p = offer.product_name;
  const from = offer.supplier_name;
  const d = offer.proposed_delivery_date;
  const text = {
    tl: `[AgriConnect] May bagong alok para sa ${p}: ${price} mula sa ${from}${d ? `, ide-deliver ${d}` : ""}. Buksan ang AgriConnect para tanggapin.`,
    bis: `[AgriConnect] Naay bag-ong tanyag para sa ${p}: ${price} gikan sa ${from}${d ? `, ihatod ${d}` : ""}. Ablihi ang AgriConnect aron dawaton.`,
    hil: `[AgriConnect] May bag-o nga tanyag para sa ${p}: ${price} halin sa ${from}${d ? `, ihatod ${d}` : ""}. Buksi ang AgriConnect para batunon.`,
    ilo: `[AgriConnect] Adda baro nga idiaya para iti ${p}: ${price} manipud iti ${from}${d ? `, maitulod ${d}` : ""}. Lukatan ti AgriConnect tapno awaten.`,
    en: `[AgriConnect] New group offer for ${p}: ${price} from ${from}${d ? `, delivery ${d}` : ""}. Open AgriConnect to accept.`,
  };
  for (const farmer of farmers) {
    await notify({
      recipient_type: "farmer",
      recipient_id: farmer.id,
      kind: "group_offer",
      title: `Group offer for ${offer.product_name}`,
      body: `${offer.supplier_name} offers ${price} to farmers in Brgy. ${offer.barangay}`,
      link: `#/requests/${farmer.request_id}`,
      text,
    });
  }
  return { notified: farmers.length };
}

module.exports = {
  notify,
  notifyStaff,
  textFarmer,
  listNotifications,
  markNotificationsRead,
  notifyFarmersOfOffer,
  STAFF_KEY,
};
