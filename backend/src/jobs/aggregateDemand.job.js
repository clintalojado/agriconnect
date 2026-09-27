const cron = require("node-cron");
const { runDemandAggregation } = require("../services/aggregation.service");

// Runs daily at midnight (server time).
const SCHEDULE = "0 0 * * *";

function scheduleAggregationJob() {
  return cron.schedule(SCHEDULE, () => {
    try {
      const summary = runDemandAggregation();
      const barangayCount = Object.keys(summary).length;
      console.log(`[aggregateDemand] daily aggregation complete — ${barangayCount} barangay(s) updated`);
    } catch (err) {
      console.error("[aggregateDemand] daily aggregation failed:", err);
    }
  });
}

module.exports = { scheduleAggregationJob };
