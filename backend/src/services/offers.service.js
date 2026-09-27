const { getDb } = require("../db/connection");

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function submitOffer({
  aggregated_demand_id,
  supplier_id,
  price_per_unit,
  min_order_quantity,
  available_quantity,
  proposed_delivery_date,
  delivery_point,
  offer_validity,
}) {
  const db = getDb();

  const price = Number(price_per_unit);
  const available = Number(available_quantity);
  const minimum = min_order_quantity == null || min_order_quantity === "" ? null : Number(min_order_quantity);
  if (!Number.isFinite(price) || price <= 0) {
    throw badRequest("price_per_unit must be a positive number");
  }
  if (!Number.isFinite(available) || available <= 0) {
    throw badRequest("available_quantity must be a positive number");
  }
  if (minimum != null && (!Number.isFinite(minimum) || minimum < 0 || minimum > available)) {
    throw badRequest("min_order_quantity must be between 0 and available_quantity");
  }

  const demand = db.prepare("SELECT * FROM aggregated_demand WHERE id = ?").get(aggregated_demand_id);
  if (!demand) {
    throw badRequest("Unknown aggregated_demand_id");
  }
  if (demand.status === "closed") {
    throw badRequest("This demand pool is closed and no longer takes offers");
  }

  const supplier = db.prepare("SELECT id FROM suppliers WHERE id = ?").get(supplier_id);
  if (!supplier) {
    throw badRequest("Unknown supplier_id");
  }

  const result = db
    .prepare(
      `INSERT INTO supplier_offers
        (aggregated_demand_id, supplier_id, price_per_unit, min_order_quantity, available_quantity,
         proposed_delivery_date, delivery_point, offer_validity, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'submitted')`
    )
    .run(
      aggregated_demand_id,
      supplier_id,
      price,
      minimum,
      available,
      proposed_delivery_date || null,
      delivery_point || null,
      offer_validity || null
    );

  if (demand.status === "collecting" || demand.status === "market_viable") {
    db.prepare("UPDATE aggregated_demand SET status = 'offered' WHERE id = ?").run(aggregated_demand_id);
  }

  return db.prepare("SELECT * FROM supplier_offers WHERE id = ?").get(result.lastInsertRowid);
}

function getOffersBySupplier(supplierId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT so.*, ad.product_name, ad.barangay, ad.time_period, ad.unit AS demand_unit
       FROM supplier_offers so
       JOIN aggregated_demand ad ON ad.id = so.aggregated_demand_id
       WHERE so.supplier_id = ?
       ORDER BY so.created_at DESC`
    )
    .all(supplierId);
}

// Farmers who have responded to an offer, so the supplier can message them.
function getFarmersForOffer(offerId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT f.id, f.name, f.phone_number, f.barangay, fc.status AS confirmation_status,
              fir.quantity, fir.unit
       FROM farmer_confirmations fc
       JOIN farmers f ON f.id = fc.farmer_id
       JOIN farm_input_requests fir ON fir.id = fc.request_id
       WHERE fc.offer_id = ?
       ORDER BY fc.confirmed_at DESC`
    )
    .all(offerId);
}

module.exports = { submitOffer, getOffersBySupplier, getFarmersForOffer };
