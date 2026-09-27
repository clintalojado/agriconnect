# Jobs

Scheduled/cron jobs.

- `aggregateDemand.job.js` — schedules `aggregation.service.js`'s
  `runDemandAggregation()` to run daily at midnight, via `node-cron`. Started
  from `src/index.js` on server boot.
