# Services

Business logic, kept separate from route handlers.

- `nlp.service.js` — Claude API extraction of product/quantity/barangay/date
  from raw farmer messages.
- `aggregation.service.js` — groups validated `farm_input_requests` by
  product/barangay/unit for the current period, upserts totals into
  `aggregated_demand`, flags groups meeting the viability threshold as
  `market_viable`, and advances the underlying requests to `aggregated`.
- `farmers.service.js` / `suppliers.service.js` — find-or-create by phone
  number, used to identify farmers and suppliers without a full auth system.
- `requests.service.js` — submits a farm input request (calls the NLP
  service), then saves farmer corrections and marks it `validated`.
- `offers.service.js` — saves a supplier's offer against an aggregated
  demand entry, flipping that entry's status to `offered`.
- `confirmations.service.js` — matches a farmer's request to supplier offers
  for the same product/barangay, and records the farmer's
  accept/decline/revision-requested response. Multiple farmers can accept
  the same offer; the confirmed farmer count and quantity are derived by
  summing accepted confirmations, not a stored column.
- `deliveries.service.js` — schedules a delivery for a supplier offer and
  marks it completed; completing a delivery writes an `impact_records` row
  (farmers served, trips avoided, estimated savings) computed from that
  offer's accepted confirmations.
- `impact.service.js` — aggregates farmers/requests/orders/impact metrics
  for the admin dashboard, with optional barangay + date range filtering.
