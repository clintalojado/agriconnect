const { getDb } = require("../db/connection");

function notFound(message) {
  const err = new Error(message);
  err.status = 404;
  return err;
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

const VALID_STATUSES = ["accepted", "declined", "revision_requested"];

function getOffersForRequest(requestId) {
  const db = getDb();
  const request = db.prepare("SELECT * FROM farm_input_requests WHERE id = ?").get(requestId);
  if (!request) {
    throw notFound("Request not found");
  }

  const offers = db
    .prepare(
      `SELECT so.*, s.name AS supplier_name, s.phone AS supplier_phone, ad.unit AS demand_unit,
         (SELECT fc.status FROM farmer_confirmations fc
          WHERE fc.offer_id = so.id AND fc.request_id = ?
          ORDER BY fc.id DESC LIMIT 1) AS my_status
       FROM supplier_offers so
       JOIN suppliers s ON s.id = so.supplier_id
       JOIN aggregated_demand ad ON ad.id = so.aggregated_demand_id
       WHERE ad.product_name = ? AND ad.barangay = ?
       ORDER BY so.created_at DESC`
    )
    .all(requestId, request.product_name, request.barangay);

  return { request, offers };
}

function getConfirmationSummary(offerId) {
  const db = getDb();
  const offer = db
    .prepare(
      `SELECT so.*, s.name AS supplier_name
       FROM supplier_offers so
       JOIN suppliers s ON s.id = so.supplier_id
       WHERE so.id = ?`
    )
    .get(offerId);
  if (!offer) {
    throw notFound("Offer not found");
  }

  const totals = db
    .prepare(
      `SELECT COUNT(DISTINCT fc.farmer_id) AS confirmed_farmer_count,
              COALESCE(SUM(fir.quantity), 0) AS confirmed_quantity
       FROM farmer_confirmations fc
       JOIN farm_input_requests fir ON fir.id = fc.request_id
       WHERE fc.offer_id = ? AND fc.status = 'accepted'`
    )
    .get(offerId);

  return { offer, ...totals };
}

function respondToOffer({ request_id, offer_id, farmer_id, status }) {
  if (!VALID_STATUSES.includes(status)) {
    throw badRequest(`status must be one of ${VALID_STATUSES.join(", ")}`);
  }

  const db = getDb();

  const request = db.prepare("SELECT id, farmer_id FROM farm_input_requests WHERE id = ?").get(request_id);
  if (!request) {
    throw badRequest("Unknown request_id");
  }
  if (Number(request.farmer_id) !== Number(farmer_id)) {
    throw badRequest("This request belongs to a different farmer");
  }
  const offer = db.prepare("SELECT id FROM supplier_offers WHERE id = ?").get(offer_id);
  if (!offer) {
    throw badRequest("Unknown offer_id");
  }
  const farmer = db.prepare("SELECT id FROM farmers WHERE id = ?").get(farmer_id);
  if (!farmer) {
    throw badRequest("Unknown farmer_id");
  }

  const existing = db
    .prepare("SELECT id FROM farmer_confirmations WHERE request_id = ? AND offer_id = ? AND farmer_id = ?")
    .get(request_id, offer_id, farmer_id);

  if (existing) {
    db.prepare("UPDATE farmer_confirmations SET status = ?, confirmed_at = datetime('now') WHERE id = ?").run(
      status,
      existing.id
    );
  } else {
    db.prepare(
      `INSERT INTO farmer_confirmations (request_id, offer_id, farmer_id, status, confirmed_at)
       VALUES (?, ?, ?, ?, datetime('now'))`
    ).run(request_id, offer_id, farmer_id, status);
  }

  return getConfirmationSummary(offer_id);
}

module.exports = { getOffersForRequest, respondToOffer, getConfirmationSummary };
