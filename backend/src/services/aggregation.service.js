const { getDb } = require("../db/connection");

const DEFAULT_VIABILITY_THRESHOLD = 20;

function pad2(n) {
  return String(n).padStart(2, "0");
}

function isoWeekLabel(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${pad2(weekNo)}`;
}

function getTimePeriod(periodType, date) {
  if (periodType === "weekly") {
    return isoWeekLabel(date);
  }
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;
}

function withTransaction(db, fn) {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/**
 * Groups validated farm_input_requests by product/barangay/unit and adds them
 * to the matching aggregated_demand pool for the current time period, flags
 * pools meeting viabilityThreshold as market_viable, and advances the
 * underlying requests to 'aggregated'. Only newly validated requests are
 * counted, so each request is added to a pool exactly once. The status of
 * in-flight pools ('offered' or 'closed') is left alone.
 *
 * A pool is keyed by product/barangay/period (not unit), so requests in a
 * different unit than the existing pool (e.g. kg into a sacks pool) are left
 * validated and reported under `skipped` rather than mixed into the total.
 */
function runDemandAggregation({
  periodType = "monthly",
  viabilityThreshold = DEFAULT_VIABILITY_THRESHOLD,
  now = new Date(),
} = {}) {
  const db = getDb();
  const timePeriod = getTimePeriod(periodType, now);
  const threshold = Number(viabilityThreshold) > 0 ? Number(viabilityThreshold) : DEFAULT_VIABILITY_THRESHOLD;

  const groups = db
    .prepare(
      `SELECT product_name, barangay, unit,
              SUM(quantity) AS total_quantity,
              COUNT(DISTINCT farmer_id) AS farmer_count
       FROM farm_input_requests
       WHERE status = 'validated'
         AND product_name IS NOT NULL
         AND barangay IS NOT NULL
         AND unit IS NOT NULL
         AND quantity IS NOT NULL
         AND farmer_id IN (SELECT id FROM farmers WHERE verification_status = 'verified')
       GROUP BY product_name, barangay, unit`
    )
    .all();

  const findPool = db.prepare(
    "SELECT * FROM aggregated_demand WHERE product_name = ? AND barangay = ? AND time_period = ?"
  );
  const insertPool = db.prepare(
    `INSERT INTO aggregated_demand (product_name, total_quantity, unit, barangay, time_period, status)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const updatePool = db.prepare("UPDATE aggregated_demand SET total_quantity = ?, status = ? WHERE id = ?");

  const markAggregated = db.prepare(
    `UPDATE farm_input_requests
     SET status = 'aggregated'
     WHERE status = 'validated' AND product_name = ? AND barangay = ? AND unit = ? AND quantity IS NOT NULL
       AND farmer_id IN (SELECT id FROM farmers WHERE verification_status = 'verified')`
  );

  const skipped = [];
  const results = withTransaction(db, () => {
    const rows = [];
    for (const group of groups) {
      const pool = findPool.get(group.product_name, group.barangay, timePeriod);
      if (pool && pool.unit !== group.unit) {
        skipped.push({ ...group, reason: `pool for this period is measured in ${pool.unit}` });
        continue;
      }

      const total = (pool ? pool.total_quantity : 0) + group.total_quantity;
      let status = total >= threshold ? "market_viable" : "collecting";
      if (pool && ["offered", "closed"].includes(pool.status)) status = pool.status;

      if (pool) updatePool.run(total, status, pool.id);
      else insertPool.run(group.product_name, total, group.unit, group.barangay, timePeriod, status);

      markAggregated.run(group.product_name, group.barangay, group.unit);
      rows.push({ ...group, total_quantity: total, time_period: timePeriod, status });
    }
    return rows;
  });

  const summary = summarizeByBarangay(results);
  if (skipped.length) {
    console.warn(`[aggregation] ${skipped.length} group(s) skipped because of a unit mismatch`);
  }
  return summary;
}

// Pools newly confirmed requests right away instead of waiting for the
// nightly job, so suppliers see demand (and farmers get offers) the same day.
// Never throws: the request is already saved, and the nightly job retries.
function aggregateNow() {
  try {
    runDemandAggregation();
  } catch (err) {
    console.error("[aggregation] immediate aggregation failed:", err.message);
  }
}

function summarizeByBarangay(rows) {
  const byBarangay = {};
  for (const row of rows) {
    if (!byBarangay[row.barangay]) {
      byBarangay[row.barangay] = [];
    }
    byBarangay[row.barangay].push({
      product_name: row.product_name,
      total_quantity: row.total_quantity,
      unit: row.unit,
      farmer_count: row.farmer_count,
      time_period: row.time_period,
      status: row.status,
    });
  }
  return byBarangay;
}

const AGGREGATED_DEMAND_WITH_FARMER_COUNT = `
  SELECT ad.*,
    (SELECT COUNT(DISTINCT fir.farmer_id)
     FROM farm_input_requests fir
     WHERE fir.product_name = ad.product_name
       AND fir.barangay = ad.barangay
       AND fir.status IN ('validated', 'aggregated')) AS farmer_count
  FROM aggregated_demand ad
`;

function getAggregatedDemand({ barangay } = {}) {
  const db = getDb();
  if (barangay) {
    return db
      .prepare(`${AGGREGATED_DEMAND_WITH_FARMER_COUNT} WHERE ad.barangay = ? ORDER BY ad.product_name`)
      .all(barangay);
  }
  return db
    .prepare(`${AGGREGATED_DEMAND_WITH_FARMER_COUNT} ORDER BY ad.barangay, ad.product_name`)
    .all();
}

module.exports = {
  runDemandAggregation,
  aggregateNow,
  getAggregatedDemand,
  DEFAULT_VIABILITY_THRESHOLD,
};
