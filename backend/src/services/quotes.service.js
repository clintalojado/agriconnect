// Quotations (BPMN phase 3): verified suppliers quote on a farmer's request;
// the farmer accepts one (creating an order) or negotiates in chat.

const { getDb } = require("../db/connection");
const { getRequestRow } = require("./requests.service");
const { notify } = require("./notifications.service");
const { getOrCreateConversation, addSystemMessage } = require("./messages.service");
const { badRequest, forbidden, notFound, conflict } = require("../utils/errors");
const { money, perUnit } = require("../utils/format");

const OPEN_REQUEST_STATUSES = ["validated", "aggregated"];

// The "you got a quote" text, in each reply language (notify picks the farmer's).
function quoteText(what, price, from) {
  return {
    tl: `[AgriConnect] May quote para sa ${what}: ${price} mula sa ${from}. Buksan ang AgriConnect para tanggapin.`,
    bis: `[AgriConnect] Naay quote para sa ${what}: ${price} gikan sa ${from}. Ablihi ang AgriConnect aron dawaton.`,
    hil: `[AgriConnect] May quote para sa ${what}: ${price} halin sa ${from}. Buksi ang AgriConnect para batunon.`,
    ilo: `[AgriConnect] Adda quote para iti ${what}: ${price} manipud iti ${from}. Lukatan ti AgriConnect tapno awaten.`,
    en: `[AgriConnect] New quote for ${what}: ${price} from ${from}. Open AgriConnect to accept.`,
  };
}

function getQuote(id) {
  const quote = getDb()
    .prepare(
      `SELECT q.*, s.name AS supplier_name, r.product_name, r.unit, r.farmer_id, r.quantity AS requested_quantity,
              q.price_per_unit * q.quantity + q.delivery_fee AS total
       FROM quotes q
       JOIN suppliers s ON s.id = q.supplier_id
       JOIN farm_input_requests r ON r.id = q.request_id
       WHERE q.id = ?`
    )
    .get(id);
  if (!quote) throw notFound("Quote not found");
  return quote;
}

function assertRequestOpen(request) {
  if (!OPEN_REQUEST_STATUSES.includes(request.status)) throw badRequest("This request isn't open for quotations");
  if (request.farmer_verification !== "verified") throw badRequest("This farmer isn't verified yet");
  if (request.order_id) throw conflict("The farmer has already accepted a quotation");
}

/** Supplier submits (or updates their pending) quotation on a request. */
async function sendQuote({ request_id, supplier_id, price_per_unit, quantity, delivery_fee = 0, delivery_date, delivery_option = "delivery", note }) {
  const db = getDb();
  const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(supplier_id);
  if (!supplier) throw badRequest("Unknown supplier_id");
  if (!supplier.verified) throw forbidden("Only verified suppliers can send quotations. Staff will verify your store.");

  const request = getRequestRow(request_id);
  assertRequestOpen(request);

  const price = Number(price_per_unit);
  const qty = quantity == null || quantity === "" ? request.quantity : Number(quantity);
  const fee = delivery_fee == null || delivery_fee === "" ? 0 : Number(delivery_fee);
  if (!Number.isFinite(price) || price <= 0) throw badRequest("price_per_unit must be a positive number");
  if (!Number.isFinite(qty) || qty <= 0) throw badRequest("quantity must be a positive number");
  if (!Number.isFinite(fee) || fee < 0) throw badRequest("delivery_fee can't be negative");
  if (!["delivery", "pickup"].includes(delivery_option)) throw badRequest("delivery_option must be delivery or pickup");

  const existing = db.prepare("SELECT * FROM quotes WHERE request_id = ? AND supplier_id = ?").get(request_id, supplier_id);
  if (existing && existing.status === "accepted") throw conflict("Your quotation was already accepted");

  db.prepare(
    `INSERT INTO quotes (request_id, supplier_id, price_per_unit, quantity, delivery_fee, delivery_date, delivery_option, note, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
     ON CONFLICT (request_id, supplier_id) DO UPDATE SET
       price_per_unit = excluded.price_per_unit, quantity = excluded.quantity, delivery_fee = excluded.delivery_fee,
       delivery_date = excluded.delivery_date, delivery_option = excluded.delivery_option, note = excluded.note,
       status = 'pending', updated_at = datetime('now')`
  ).run(request_id, supplier_id, price, qty, fee, delivery_date || null, delivery_option, note ? String(note).trim() : null);

  const quote = getQuote(db.prepare("SELECT id FROM quotes WHERE request_id = ? AND supplier_id = ?").get(request_id, supplier_id).id);
  await notify({
    recipient_type: "farmer",
    recipient_id: request.farmer_id,
    kind: "quote",
    title: `${existing ? "Updated quotation" : "New quotation"} for ${request.product_name}`,
    body: `${supplier.name}: ${money(price)}/${perUnit(request.unit)}${delivery_option === "pickup" ? " · pickup" : ""}`,
    link: `#/requests/${request.id}`,
    text: quoteText(`${request.quantity} ${request.unit || ""} ${request.product_name}`, `${money(price)}/${perUnit(request.unit)}`, supplier.name),
  });
  return quote;
}

function listQuotesForSupplier(supplierId) {
  return getDb()
    .prepare(
      `SELECT q.*, r.product_name, r.unit, r.barangay, r.preferred_date, f.name AS farmer_name,
              q.price_per_unit * q.quantity + q.delivery_fee AS total,
              o.id AS order_id, o.code AS order_code, o.status AS order_status
       FROM quotes q
       JOIN farm_input_requests r ON r.id = q.request_id
       JOIN farmers f ON f.id = r.farmer_id
       LEFT JOIN orders o ON o.quote_id = q.id
       WHERE q.supplier_id = ?
       ORDER BY q.id DESC`
    )
    .all(supplierId);
}

function orderCode(id) {
  return `AC-${new Date().getFullYear()}-${String(id).padStart(4, "0")}`;
}

/**
 * Farmer accepts a quotation (BPMN: select preferred supplier / confirm
 * order). Creates the order, declines the other quotations, and tells
 * every supplier involved.
 */
async function acceptQuote({ quote_id, farmer_id }) {
  const db = getDb();
  const quote = getQuote(quote_id);
  if (Number(quote.farmer_id) !== Number(farmer_id)) throw forbidden("This quotation is for another farmer's request");
  if (quote.status !== "pending") throw badRequest(`This quotation is ${quote.status}`);
  const request = getRequestRow(quote.request_id);
  assertRequestOpen(request);

  db.exec("BEGIN");
  let orderId;
  try {
    db.prepare("UPDATE quotes SET status = 'accepted', updated_at = datetime('now') WHERE id = ?").run(quote.id);
    db.prepare(
      "UPDATE quotes SET status = 'declined', updated_at = datetime('now') WHERE request_id = ? AND id != ? AND status = 'pending'"
    ).run(request.id, quote.id);
    const result = db
      .prepare(
        `INSERT INTO orders (request_id, quote_id, farmer_id, supplier_id, product_name, quantity, unit, price_per_unit,
                             delivery_fee, total, delivery_date, delivery_option, delivery_location)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        request.id,
        quote.id,
        request.farmer_id,
        quote.supplier_id,
        request.product_name,
        quote.quantity,
        request.unit,
        quote.price_per_unit,
        quote.delivery_fee,
        quote.total,
        quote.delivery_date,
        quote.delivery_option,
        request.delivery_location || `Brgy. ${request.barangay}`
      );
    orderId = Number(result.lastInsertRowid);
    db.prepare("UPDATE orders SET code = ? WHERE id = ?").run(orderCode(orderId), orderId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  await notify({
    recipient_type: "supplier",
    recipient_id: quote.supplier_id,
    kind: "quote_accepted",
    title: `Order ${order.code} confirmed`,
    body: `${request.farmer_name} accepted your quotation: ${quote.quantity} ${request.unit || ""} ${request.product_name}`,
    link: `#/orders/${order.id}`,
    text: `[AgriConnect] Order ${order.code}: ${request.farmer_name} accepted your quote for ${quote.quantity} ${request.unit || ""} ${request.product_name} (${money(order.total)}). Please prepare the delivery.`,
  });
  const declined = db.prepare("SELECT supplier_id FROM quotes WHERE request_id = ? AND status = 'declined' AND id != ?").all(request.id, quote.id);
  for (const d of declined) {
    await notify({
      recipient_type: "supplier",
      recipient_id: d.supplier_id,
      kind: "quote_declined",
      title: `Quotation not selected: ${request.product_name}`,
      body: `The farmer chose another supplier for request #${request.id}.`,
      link: "#/quotes",
    });
  }
  return order;
}

async function declineQuote({ quote_id, farmer_id }) {
  const quote = getQuote(quote_id);
  if (Number(quote.farmer_id) !== Number(farmer_id)) throw forbidden("This quotation is for another farmer's request");
  if (quote.status !== "pending") throw badRequest(`This quotation is ${quote.status}`);
  getDb().prepare("UPDATE quotes SET status = 'declined', updated_at = datetime('now') WHERE id = ?").run(quote.id);
  await notify({
    recipient_type: "supplier",
    recipient_id: quote.supplier_id,
    kind: "quote_declined",
    title: `Quotation declined: ${quote.product_name}`,
    body: `The farmer declined your quotation on request #${quote.request_id}.`,
    link: "#/quotes",
  });
  return getQuote(quote.id);
}

function withdrawQuote({ quote_id, supplier_id }) {
  const quote = getQuote(quote_id);
  if (Number(quote.supplier_id) !== Number(supplier_id)) throw forbidden("This isn't your quotation");
  if (quote.status !== "pending") throw badRequest(`This quotation is ${quote.status}`);
  getDb().prepare("UPDATE quotes SET status = 'withdrawn', updated_at = datetime('now') WHERE id = ?").run(quote.id);
  return getQuote(quote.id);
}

/** "Negotiate": opens the farmer–supplier chat with the quotation pinned as context. */
function negotiateQuote({ quote_id, farmer_id }) {
  const quote = getQuote(quote_id);
  if (Number(quote.farmer_id) !== Number(farmer_id)) throw forbidden("This quotation is for another farmer's request");
  const conversation = getOrCreateConversation({ farmer_id, supplier_id: quote.supplier_id });
  addSystemMessage(
    conversation.id,
    `Negotiating quotation #${quote.id}: ${quote.quantity} ${quote.unit || ""} ${quote.product_name} at ${money(quote.price_per_unit)}/${perUnit(quote.unit)}` +
      (quote.delivery_fee ? ` + ${money(quote.delivery_fee)} delivery` : "")
  );
  return conversation;
}

module.exports = {
  getQuote,
  sendQuote,
  listQuotesForSupplier,
  acceptQuote,
  declineQuote,
  withdrawQuote,
  negotiateQuote,
};
