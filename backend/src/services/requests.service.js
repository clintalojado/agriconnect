const { getDb } = require("../db/connection");
const { extractFarmInputRequest } = require("./nlp.service");
const { aggregateNow } = require("./aggregation.service");
const { findProductByName } = require("./catalog.service");
const { notify } = require("./notifications.service");
const { award } = require("./points.service");
const { badRequest, notFound } = require("../utils/errors");

// One row per request, with its quote count and active order. A request has
// at most one non-cancelled order (enforced when a quote is accepted).
const REQUEST_SELECT = `
  SELECT r.*,
         f.name AS farmer_name, f.phone_number AS farmer_phone, f.municipality AS farmer_municipality,
         f.verification_status AS farmer_verification,
         p.category AS product_category, p.variant AS product_variant,
         (SELECT COUNT(*) FROM quotes q WHERE q.request_id = r.id AND q.status IN ('pending', 'accepted')) AS quote_count,
         (SELECT MIN(q.price_per_unit) FROM quotes q WHERE q.request_id = r.id AND q.status = 'pending') AS best_quote_price,
         o.id AS order_id, o.code AS order_code, o.status AS order_status, o.total AS order_total,
         os.name AS order_supplier_name
  FROM farm_input_requests r
  JOIN farmers f ON f.id = r.farmer_id
  LEFT JOIN products p ON p.id = r.product_id
  LEFT JOIN orders o ON o.request_id = r.id AND o.status != 'cancelled'
  LEFT JOIN suppliers os ON os.id = o.supplier_id`;

const ORDER_TO_DISPLAY = {
  confirmed: "supplier_confirmed",
  for_delivery: "for_delivery",
  delivered: "delivered",
  completed: "completed",
};

// The status farmers see (matches the app's tabs): draft, awaiting_verification,
// for_quotation, supplier_confirmed, for_delivery, delivered, completed, rejected.
function displayStatus(row) {
  if (row.status === "rejected") return "rejected";
  if (row.status === "pending_validation") return "draft";
  if (row.order_status && ORDER_TO_DISPLAY[row.order_status]) return ORDER_TO_DISPLAY[row.order_status];
  if (row.farmer_verification !== "verified") return "awaiting_verification";
  return "for_quotation";
}

function decorate(row) {
  return row ? { ...row, display_status: displayStatus(row) } : row;
}

function cleanText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function isoDateOrNull(value) {
  const text = cleanText(value);
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(text))) {
    throw badRequest("needed_by must be a date (YYYY-MM-DD)");
  }
  return text;
}

function getRequestRow(id) {
  const row = getDb().prepare(`${REQUEST_SELECT} WHERE r.id = ?`).get(id);
  if (!row) throw notFound("Request not found");
  return decorate(row);
}

// ---------- Publishing (BPMN: store validated request → aggregate → match suppliers) ----------

/**
 * Tell verified suppliers who can fill this request: they list the product,
 * cover the barangay, or were picked by the farmer.
 */
async function notifySuppliersOfRequest(request) {
  const db = getDb();
  const suppliers = db.prepare("SELECT * FROM suppliers WHERE verified = 1").all();
  const listing = new Set(
    db.prepare("SELECT supplier_id FROM supplier_products WHERE product_id = ?").all(request.product_id ?? -1).map((r) => r.supplier_id)
  );
  const barangay = (request.barangay || "").toLowerCase();

  for (const s of suppliers) {
    const covers =
      (s.barangay || "").toLowerCase() === barangay ||
      (s.coverage_barangays || "")
        .split(",")
        .map((b) => b.trim().toLowerCase())
        .includes(barangay);
    const preferred = s.id === request.preferred_supplier_id;
    if (!preferred && !covers && !listing.has(s.id)) continue;

    await notify({
      recipient_type: "supplier",
      recipient_id: s.id,
      kind: "new_request",
      title: `${preferred ? "A farmer picked you: " : "New request: "}${request.quantity} ${request.unit || ""} ${request.product_name}`,
      body: `Brgy. ${request.barangay}${request.preferred_date ? ` · needed ${request.preferred_date}` : ""}`,
      link: `#/requests/${request.id}`,
      text: preferred
        ? `[AgriConnect] ${request.farmer_name || "A farmer"} wants a quote from you: ${request.quantity} ${request.unit || ""} ${request.product_name}, Brgy. ${request.barangay}.`
        : null,
    });
  }
}

/**
 * Runs once a request is confirmed by the farmer (or staff on their behalf).
 * Requests from farmers still awaiting barangay verification are held: they
 * are stored, but not pooled or shown to suppliers until the farmer is
 * verified (see releaseHeldRequests).
 */
async function onRequestPublished(requestId) {
  const request = getRequestRow(requestId);
  award(request.farmer_id, "request_published", request.id);
  if (request.farmer_verification !== "verified") return request;
  aggregateNow();
  await notifySuppliersOfRequest(request);
  return getRequestRow(requestId);
}

/** After a farmer is verified: pool and announce their held requests. */
async function releaseHeldRequests(farmerId) {
  const db = getDb();
  aggregateNow();
  const held = db
    .prepare(
      `${REQUEST_SELECT} WHERE r.farmer_id = ? AND r.status IN ('validated', 'aggregated') AND o.id IS NULL`
    )
    .all(farmerId);
  for (const request of held) await notifySuppliersOfRequest(request);
  return held.length;
}

// ---------- Creating requests ----------

/**
 * Structured request (the "Create Request" form, the marketplace's
 * "Add to Request", or staff publishing a farmer's text). Stored as validated.
 */
async function createStructuredRequest({
  farmer_id,
  product_id,
  product_name,
  quantity,
  unit,
  needed_by,
  preferred_date,
  delivery_location,
  notes,
  preferred_supplier_id,
  channel = "app",
  raw_message,
  inbound_message_id = null,
}) {
  const db = getDb();
  const farmer = db.prepare("SELECT * FROM farmers WHERE id = ?").get(farmer_id);
  if (!farmer) throw badRequest("Unknown farmer_id");

  let product = null;
  if (product_id) {
    product = db.prepare("SELECT * FROM products WHERE id = ?").get(product_id);
    if (!product) throw badRequest("Unknown product_id");
  } else {
    product = findProductByName(product_name);
  }
  const name = product?.name || cleanText(product_name);
  if (!name) throw badRequest("product_id or product_name is required");

  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) throw badRequest("quantity must be a positive number");
  const unitText = cleanText(unit) || product?.unit;
  if (!unitText) throw badRequest("unit is required (e.g. sacks, kg, liters)");

  const neededBy = isoDateOrNull(needed_by);
  if (preferred_supplier_id && !db.prepare("SELECT id FROM suppliers WHERE id = ?").get(preferred_supplier_id)) {
    throw badRequest("Unknown preferred_supplier_id");
  }
  if (!["app", "sms", "messenger", "web"].includes(channel)) throw badRequest("Invalid channel");

  const result = db
    .prepare(
      `INSERT INTO farm_input_requests
        (farmer_id, raw_message, product_id, product_name, quantity, unit, barangay, preferred_date, needed_by,
         delivery_location, notes, preferred_supplier_id, channel, inbound_message_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'validated')`
    )
    .run(
      farmer.id,
      cleanText(raw_message) || `${qty} ${unitText} ${name}`,
      product?.id ?? null,
      name,
      qty,
      unitText,
      farmer.barangay,
      cleanText(preferred_date) || neededBy,
      neededBy,
      cleanText(delivery_location) || `Brgy. ${farmer.barangay}, ${farmer.municipality}`,
      cleanText(notes),
      preferred_supplier_id || null,
      channel,
      inbound_message_id
    );

  return onRequestPublished(result.lastInsertRowid);
}

/** AI flow, step 1: read the farmer's own words into a draft for them to review. */
async function submitFarmInputRequest({ farmer_id, raw_message }) {
  const db = getDb();
  const farmer = db.prepare("SELECT id, barangay FROM farmers WHERE id = ?").get(farmer_id);
  if (!farmer) throw badRequest("Unknown farmer_id");

  const extraction = await extractFarmInputRequest(raw_message, { profileBarangay: farmer.barangay });
  const product = findProductByName(extraction.product_name);
  const result = db
    .prepare(
      `INSERT INTO farm_input_requests
        (farmer_id, raw_message, product_id, product_name, quantity, unit, barangay, preferred_date, needed_by, channel, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'app', 'pending_validation')`
    )
    .run(
      farmer_id,
      raw_message,
      product?.id ?? null,
      extraction.product_name,
      extraction.quantity,
      extraction.unit,
      extraction.barangay,
      extraction.preferred_date,
      extraction.preferred_date_iso
    );

  return { request: getRequestRow(result.lastInsertRowid), extraction };
}

/** AI flow, step 2: the farmer confirms (and corrects) the draft. */
async function validateFarmInputRequest({ id, product_name, quantity, unit, barangay, preferred_date, needed_by, delivery_location, notes }) {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM farm_input_requests WHERE id = ?").get(id);
  if (!existing) throw notFound("Request not found");
  // Once pooled or quoted, changing it would invalidate counts and quotes.
  if (existing.status !== "pending_validation") {
    throw badRequest(`This request is already ${existing.status === "validated" ? "confirmed" : existing.status} and can no longer be edited`);
  }

  const name = cleanText(product_name);
  const qty = quantity === "" || quantity == null ? null : Number(quantity);
  if (!name) throw badRequest("product_name is required");
  if (qty == null || !Number.isFinite(qty) || qty <= 0) throw badRequest("quantity must be a positive number");
  // Pooling groups by unit, so a request without one could never be pooled.
  if (!cleanText(unit)) throw badRequest("unit is required (e.g. sacks, kg, liters)");
  if (!cleanText(barangay)) throw badRequest("barangay is required");

  const product = findProductByName(name);
  db.prepare(
    `UPDATE farm_input_requests
     SET product_id = ?, product_name = ?, quantity = ?, unit = ?, barangay = ?, preferred_date = ?,
         needed_by = COALESCE(?, needed_by), delivery_location = ?, notes = ?, status = 'validated'
     WHERE id = ?`
  ).run(
    product?.id ?? null,
    product?.name || name,
    qty,
    cleanText(unit),
    cleanText(barangay),
    cleanText(preferred_date),
    isoDateOrNull(needed_by),
    cleanText(delivery_location),
    cleanText(notes),
    id
  );

  return onRequestPublished(id);
}

function rejectRequest(id, { reason } = {}) {
  const request = getRequestRow(id);
  if (request.order_id) throw badRequest("This request already has an order");
  getDb().prepare("UPDATE farm_input_requests SET status = 'rejected', notes = COALESCE(?, notes) WHERE id = ?").run(cleanText(reason), id);
  return getRequestRow(id);
}

// ---------- Reading ----------

function getRequestsByFarmer(farmerId) {
  return getDb()
    .prepare(`${REQUEST_SELECT} WHERE r.farmer_id = ? ORDER BY r.id DESC`)
    .all(farmerId)
    .map(decorate);
}

/** Request with its quotes (best price first), for the request detail screen. */
function getRequestDetail(id) {
  const request = getRequestRow(id);
  const quotes = getDb()
    .prepare(
      `SELECT q.*, s.name AS supplier_name, s.barangay AS supplier_barangay, s.municipality AS supplier_municipality,
              s.phone AS supplier_phone, s.verified AS supplier_verified,
              (SELECT ROUND(AVG(rating), 1) FROM reviews WHERE supplier_id = s.id) AS supplier_rating,
              (SELECT COUNT(*) FROM reviews WHERE supplier_id = s.id) AS supplier_review_count,
              q.price_per_unit * q.quantity + q.delivery_fee AS total
       FROM quotes q JOIN suppliers s ON s.id = q.supplier_id
       WHERE q.request_id = ?
       ORDER BY CASE q.status WHEN 'accepted' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, total ASC`
    )
    .all(id);
  return { ...request, quotes };
}

function coverageIncludes(supplier, barangay) {
  const target = (barangay || "").toLowerCase();
  if (!target) return false;
  if ((supplier.barangay || "").toLowerCase() === target) return true;
  return (supplier.coverage_barangays || "")
    .split(",")
    .map((b) => b.trim().toLowerCase())
    .includes(target);
}

/**
 * Supplier's "New Requests" feed: open requests from verified farmers with no
 * order yet. filter: all | nearby (barangays they cover or their municipality)
 * | my_products (products they list).
 */
function listOpenRequestsForSupplier(supplierId, { filter = "all" } = {}) {
  const db = getDb();
  const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(supplierId);
  if (!supplier) throw notFound("Supplier not found");
  const myProducts = new Set(
    db.prepare("SELECT product_id FROM supplier_products WHERE supplier_id = ?").all(supplierId).map((r) => r.product_id)
  );

  const rows = db
    .prepare(
      `${REQUEST_SELECT}
       WHERE r.status IN ('validated', 'aggregated') AND f.verification_status = 'verified' AND o.id IS NULL`
    )
    .all()
    .map((r) => ({
      ...decorate(r),
      nearby:
        coverageIncludes(supplier, r.barangay) ||
        (supplier.municipality && supplier.municipality.toLowerCase() === (r.farmer_municipality || "").toLowerCase()),
      my_product: myProducts.has(r.product_id),
    }))
    .filter((r) => filter === "all" || (filter === "nearby" && r.nearby) || (filter === "my_products" && r.my_product));

  const myQuotes = new Map(
    db.prepare("SELECT * FROM quotes WHERE supplier_id = ?").all(supplierId).map((q) => [q.request_id, q])
  );
  return rows
    .map((r) => ({ ...r, my_quote: myQuotes.get(r.id) || null }))
    .sort((a, b) => b.id - a.id);
}

/** Staff view of every request. */
function listAllRequests({ status } = {}) {
  return getDb()
    .prepare(`${REQUEST_SELECT} ORDER BY r.id DESC LIMIT 300`)
    .all()
    .map(decorate)
    .filter((r) => !status || r.display_status === status || r.status === status);
}

module.exports = {
  createStructuredRequest,
  submitFarmInputRequest,
  validateFarmInputRequest,
  rejectRequest,
  getRequestsByFarmer,
  getRequestDetail,
  getRequestRow,
  listOpenRequestsForSupplier,
  listAllRequests,
  releaseHeldRequests,
  onRequestPublished,
  displayStatus,
};
