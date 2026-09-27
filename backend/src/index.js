require("dotenv").config();

const app = require("./app");
const { migrate } = require("./db/migrate");
const { scheduleAggregationJob } = require("./jobs/aggregateDemand.job");

const PORT = process.env.PORT || 4000;

// Idempotent: creates missing tables/columns and seeds the product catalog,
// so an existing database is always up to date with the code.
migrate({ quiet: true });

// Hosted demo: the disk may be wiped on restart, so refill the demo suppliers.
if (process.env.SEED_DEMO === "true") require("./db/seed").seed();

app.listen(PORT, () => {
  console.log(`AgriConnect backend listening on http://localhost:${PORT}`);
  scheduleAggregationJob();
});
