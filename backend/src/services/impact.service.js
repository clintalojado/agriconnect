const { getDb } = require("../db/connection");
const { AVG_TRIPS_SAVED_PER_FARMER, COST_PER_TRIP_PHP } = require("./deliveries.service");

const TOP_PRODUCTS_PER_BARANGAY = 3;

/**
 * Builds WHERE clauses for an optional barangay + date range filter, letting
 * the barangay and date columns come from different table aliases in the
 * same query (e.g. barangay from aggregated_demand, date from deliveries).
 */
function buildFilterClauses(
  { barangay, startDate, endDate },
  { barangayAlias, barangayCol = "barangay", dateAlias, dateCol = "created_at" }
) {
  const clauses = [];
  const params = [];
  if (barangay && barangayAlias) {
    clauses.push(`${barangayAlias}.${barangayCol} = ?`);
    params.push(barangay);
  }
  // Compare on the date part: timestamps are 'YYYY-MM-DD HH:MM:SS', so a plain
  // string compare against an end date of 'YYYY-MM-DD' would drop that whole day.
  if (startDate && dateAlias) {
    clauses.push(`date(${dateAlias}.${dateCol}) >= date(?)`);
    params.push(startDate);
  }
  if (endDate && dateAlias) {
    clauses.push(`date(${dateAlias}.${dateCol}) <= date(?)`);
    params.push(endDate);
  }
  return { clauses, params };
}

function whereFrom(clauses) {
  return clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
}

function getImpactSummary(filters = {}) {
  const db = getDb();

  // Requests: submitted / aggregated / active farmers (anchored to the request itself)
  const reqFilter = buildFilterClauses(filters, { barangayAlias: "fir", dateAlias: "fir" });
  const requestTotals = db
    .prepare(
      `SELECT COUNT(*) AS submitted,
              SUM(CASE WHEN fir.status = 'aggregated' THEN 1 ELSE 0 END) AS aggregated,
              COUNT(DISTINCT fir.farmer_id) AS active_farmers
       FROM farm_input_requests fir
       ${whereFrom(reqFilter.clauses)}`
    )
    .get(...reqFilter.params);

  const totalFarmers = db.prepare("SELECT COUNT(*) AS count FROM farmers").get().count;

  // Fulfilled requests: reached an accepted confirmation whose delivery completed
  const fulfilled = db
    .prepare(
      `SELECT COUNT(DISTINCT fir.id) AS fulfilled_requests,
              AVG(julianday(d.completed_at) - julianday(fir.created_at)) AS avg_fulfillment_days
       FROM farm_input_requests fir
       JOIN farmer_confirmations fc ON fc.request_id = fir.id AND fc.status = 'accepted'
       JOIN supplier_offers so ON so.id = fc.offer_id
       JOIN deliveries d ON d.supplier_offer_id = so.id AND d.status = 'completed'
       ${whereFrom(reqFilter.clauses)}`
    )
    .get(...reqFilter.params);

  // Aggregated demand pools & supplier response rate
  const demandFilter = buildFilterClauses(filters, { barangayAlias: "ad", dateAlias: "ad" });
  const demandTotals = db
    .prepare(
      `SELECT COUNT(*) AS demand_pools,
              SUM(CASE WHEN EXISTS (
                SELECT 1 FROM supplier_offers so WHERE so.aggregated_demand_id = ad.id
              ) THEN 1 ELSE 0 END) AS demand_pools_with_offers
       FROM aggregated_demand ad
       ${whereFrom(demandFilter.clauses)}`
    )
    .get(...demandFilter.params);

  const supplierResponseRate =
    demandTotals.demand_pools > 0
      ? Math.round((demandTotals.demand_pools_with_offers / demandTotals.demand_pools) * 1000) / 10
      : 0;

  // Confirmed vs completed orders (an "order" = a supplier offer with >=1 accepted confirmation)
  const orderClauses = [
    "so.id IN (SELECT offer_id FROM farmer_confirmations WHERE status = 'accepted')",
    ...demandFilter.clauses,
  ];
  const orderTotals = db
    .prepare(
      `SELECT COUNT(DISTINCT so.id) AS confirmed_orders,
              COUNT(DISTINCT CASE WHEN d.status = 'completed' THEN so.id END) AS completed_orders
       FROM supplier_offers so
       JOIN aggregated_demand ad ON ad.id = so.aggregated_demand_id
       LEFT JOIN deliveries d ON d.supplier_offer_id = so.id
       ${whereFrom(orderClauses)}`
    )
    .get(...demandFilter.params);

  // Trips avoided / estimated savings, sourced from impact_records written at delivery completion
  const impactFilter = buildFilterClauses(filters, {
    barangayAlias: "ad",
    dateAlias: "d",
    dateCol: "completed_at",
  });
  const impactTotals = db
    .prepare(
      `SELECT COALESCE(SUM(ir.trips_avoided), 0) AS total_trips_avoided,
              COALESCE(SUM(ir.estimated_savings), 0) AS total_estimated_savings
       FROM impact_records ir
       JOIN deliveries d ON d.id = ir.delivery_id
       JOIN supplier_offers so ON so.id = d.supplier_offer_id
       JOIN aggregated_demand ad ON ad.id = so.aggregated_demand_id
       ${whereFrom(impactFilter.clauses)}`
    )
    .get(...impactFilter.params);

  // Orders from accepted quotations (the marketplace flow). Each completed
  // order is one farmer who didn't have to travel to town for inputs.
  const quoteFilter = buildFilterClauses(filters, { barangayAlias: "r", dateAlias: "o" });
  const quoteOrders = db
    .prepare(
      `SELECT COUNT(*) AS confirmed,
              SUM(CASE WHEN o.status = 'completed' THEN 1 ELSE 0 END) AS completed,
              COALESCE(SUM(CASE WHEN o.status = 'completed' THEN o.total END), 0) AS transaction_value,
              AVG(CASE WHEN o.status = 'completed' THEN julianday(o.completed_at) - julianday(r.created_at) END) AS avg_days
       FROM orders o JOIN farm_input_requests r ON r.id = o.request_id
       ${whereFrom([...quoteFilter.clauses, "o.status != 'cancelled'"])}`
    )
    .get(...quoteFilter.params);
  const quoteCompleted = quoteOrders.completed || 0;

  // Fulfillment time across both flows, weighted by how many requests each fulfilled.
  const pooledFulfilled = fulfilled.fulfilled_requests || 0;
  const fulfilledTotal = pooledFulfilled + quoteCompleted;
  const avgDays =
    fulfilledTotal > 0
      ? ((fulfilled.avg_fulfillment_days || 0) * pooledFulfilled + (quoteOrders.avg_days || 0) * quoteCompleted) / fulfilledTotal
      : null;

  // Top requested products per barangay
  const productRows = db
    .prepare(
      `SELECT fir.barangay AS barangay, fir.product_name AS product_name,
              SUM(fir.quantity) AS total_quantity, COUNT(*) AS request_count
       FROM farm_input_requests fir
       ${whereFrom([...reqFilter.clauses, "fir.product_name IS NOT NULL"])}
       GROUP BY fir.barangay, fir.product_name
       ORDER BY fir.barangay, total_quantity DESC`
    )
    .all(...reqFilter.params);

  const topProductsByBarangay = {};
  for (const row of productRows) {
    if (!topProductsByBarangay[row.barangay]) {
      topProductsByBarangay[row.barangay] = [];
    }
    if (topProductsByBarangay[row.barangay].length < TOP_PRODUCTS_PER_BARANGAY) {
      topProductsByBarangay[row.barangay].push({
        product_name: row.product_name,
        total_quantity: row.total_quantity,
        request_count: row.request_count,
      });
    }
  }

  return {
    farmers: {
      total: totalFarmers,
      active: requestTotals.active_farmers || 0,
    },
    requests: {
      submitted: requestTotals.submitted || 0,
      aggregated: requestTotals.aggregated || 0,
      fulfilled: fulfilledTotal,
    },
    supplier_response_rate_pct: supplierResponseRate,
    orders: {
      confirmed: (orderTotals.confirmed_orders || 0) + (quoteOrders.confirmed || 0),
      completed: (orderTotals.completed_orders || 0) + quoteCompleted,
    },
    impact: {
      trips_avoided: (impactTotals.total_trips_avoided || 0) + quoteCompleted * AVG_TRIPS_SAVED_PER_FARMER,
      estimated_savings_php:
        (impactTotals.total_estimated_savings || 0) + quoteCompleted * AVG_TRIPS_SAVED_PER_FARMER * COST_PER_TRIP_PHP,
      transaction_value_php: quoteOrders.transaction_value || 0,
    },
    avg_fulfillment_days: avgDays != null ? Math.round(avgDays * 10) / 10 : null,
    top_products_by_barangay: topProductsByBarangay,
  };
}

module.exports = { getImpactSummary };
