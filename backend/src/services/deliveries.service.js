const { getDb } = require("../db/connection");

// Assumption: each farmer whose order is fulfilled by delivery avoids one
// individual trip to buy inputs themselves.
const AVG_TRIPS_SAVED_PER_FARMER = 1;
const COST_PER_TRIP_PHP = 150;

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function notFound(message) {
  const err = new Error(message);
  err.status = 404;
  return err;
}

function scheduleDelivery({ supplier_offer_id, scheduled_date, delivery_point }) {
  const db = getDb();

  const offer = db.prepare("SELECT id FROM supplier_offers WHERE id = ?").get(supplier_offer_id);
  if (!offer) {
    throw badRequest("Unknown supplier_offer_id");
  }

  const existing = db.prepare("SELECT id FROM deliveries WHERE supplier_offer_id = ?").get(supplier_offer_id);
  if (existing) {
    throw badRequest("A delivery is already scheduled for this offer");
  }

  const result = db
    .prepare(
      "INSERT INTO deliveries (supplier_offer_id, scheduled_date, delivery_point, status) VALUES (?, ?, ?, 'scheduled')"
    )
    .run(supplier_offer_id, scheduled_date || null, delivery_point || null);

  return db.prepare("SELECT * FROM deliveries WHERE id = ?").get(result.lastInsertRowid);
}

function completeDelivery(id) {
  const db = getDb();

  const delivery = db.prepare("SELECT * FROM deliveries WHERE id = ?").get(id);
  if (!delivery) {
    throw notFound("Delivery not found");
  }
  if (delivery.status === "completed") {
    return delivery;
  }

  db.prepare("UPDATE deliveries SET status = 'completed', completed_at = datetime('now') WHERE id = ?").run(id);

  const { farmers_served } = db
    .prepare(
      `SELECT COUNT(DISTINCT farmer_id) AS farmers_served
       FROM farmer_confirmations
       WHERE offer_id = (SELECT supplier_offer_id FROM deliveries WHERE id = ?) AND status = 'accepted'`
    )
    .get(id);

  const tripsAvoided = farmers_served * AVG_TRIPS_SAVED_PER_FARMER;
  const estimatedSavings = tripsAvoided * COST_PER_TRIP_PHP;

  db.prepare(
    "INSERT INTO impact_records (delivery_id, farmers_served, trips_avoided, estimated_savings) VALUES (?, ?, ?, ?)"
  ).run(id, farmers_served, tripsAvoided, estimatedSavings);

  return db.prepare("SELECT * FROM deliveries WHERE id = ?").get(id);
}

module.exports = {
  scheduleDelivery,
  completeDelivery,
  AVG_TRIPS_SAVED_PER_FARMER,
  COST_PER_TRIP_PHP,
};
