// Staff (barangay / LGU / cooperative) dashboard counters.

const { getDb } = require("../db/connection");

function getOverview() {
  const db = getDb();
  const one = (sql) => db.prepare(sql).get().n;
  return {
    inbox: {
      open: one("SELECT COUNT(*) AS n FROM inbound_messages WHERE status IN ('new', 'needs_info', 'awaiting_confirmation')"),
      awaiting_confirmation: one("SELECT COUNT(*) AS n FROM inbound_messages WHERE status = 'awaiting_confirmation'"),
      needs_info: one("SELECT COUNT(*) AS n FROM inbound_messages WHERE status = 'needs_info'"),
    },
    farmers: {
      total: one("SELECT COUNT(*) AS n FROM farmers"),
      pending_verification: one("SELECT COUNT(*) AS n FROM farmers WHERE verification_status IN ('pending', 'more_info')"),
    },
    suppliers: {
      total: one("SELECT COUNT(*) AS n FROM suppliers"),
      unverified: one("SELECT COUNT(*) AS n FROM suppliers WHERE verified = 0"),
    },
    requests: {
      open: one(
        `SELECT COUNT(*) AS n FROM farm_input_requests r
         WHERE r.status IN ('validated', 'aggregated')
           AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.request_id = r.id AND o.status != 'cancelled')`
      ),
      without_quotes: one(
        `SELECT COUNT(*) AS n FROM farm_input_requests r
         WHERE r.status IN ('validated', 'aggregated')
           AND NOT EXISTS (SELECT 1 FROM quotes q WHERE q.request_id = r.id)
           AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.request_id = r.id AND o.status != 'cancelled')`
      ),
    },
    orders: Object.fromEntries(
      db
        .prepare("SELECT status, COUNT(*) AS n FROM orders GROUP BY status")
        .all()
        .map((r) => [r.status, r.n])
    ),
  };
}

module.exports = { getOverview };
