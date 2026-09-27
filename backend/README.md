# AgriConnect Backend

Node.js + Express REST API backed by SQLite (prototype). Requires Node >= 22.5.

## Run

```bash
npm install
cp .env.example .env
npm run db:seed      # optional: 4 verified demo suppliers with product prices
npm run dev          # migrates the database on start, then listens on :4000
```

`npm run db:migrate` applies the schema without starting the server. Migration
is idempotent: it creates missing tables, adds missing columns to older
databases, and seeds the product catalog. `node:sqlite` is still experimental,
so a one-line warning on startup is expected.

## Structure

- `src/index.js` — entrypoint: migrate, start the server, schedule the nightly pooling job.
- `src/app.js` — middleware and route mounting.
- `src/db/` — connection (`node:sqlite`), `schema.sql`, `migrate.js` (columns
  added after v1 + catalog seed), `seed.js` (demo suppliers).
- `src/routes/` — one router per resource; `src/utils/` — errors, route wrapper,
  phone normalization, price formatting.
- `src/services/`:
  - `inbound.service.js` — every SMS/Messenger text: registration
    conversation, OTP, keywords (HELP, REG, STATUS), AI reading into a
    structured multi-product request, farmer confirmation (OO/YES), staff inbox.
  - `nlp.service.js` + `nlp/` — Claude extraction with the offline Tagalog /
    Bisaya / English rule-based fallback (`NLP_MODE`).
  - `farmers.service.js`, `verification.service.js` — profiles, OTP, and the
    barangay / LGU / cooperative verification decisions.
  - `requests.service.js` — creating, confirming, and listing requests;
    display statuses; releasing held requests once a farmer is verified;
    notifying matching verified suppliers.
  - `quotes.service.js`, `orders.service.js` — quotations → orders → delivery →
    completion, ratings.
  - `catalog.service.js`, `suppliers.service.js` — product catalog, supplier
    listings and prices, directory, search.
  - `aggregation.service.js` — barangay demand pooling (verified farmers only).
  - `notifications.service.js`, `points.service.js`, `community.service.js`,
    `admin.service.js`, `impact.service.js` — bell notifications (+ SMS),
    AgriPoints ledger, community board, staff counters, reports.
  - `messages.service.js`, `calls.service.js` — chat and WebRTC call signaling.
  - `sms.service.js` + `sms/providers.js` + `messenger/provider.js` — sending
    and logging texts (SMS gateway or Messenger Send API).
- `src/realtime/hub.js` — in-memory pub/sub pushed to browsers over
  Server-Sent Events. Single-process only.

## Webhooks

- SMS gateway → `POST /api/sms/inbound` (`SMS_WEBHOOK_SECRET` optional).
- Facebook Messenger → `GET/POST /api/messenger/webhook` (`MESSENGER_VERIFY_TOKEN`,
  `MESSENGER_PAGE_TOKEN`, optional `MESSENGER_APP_SECRET` signature check).
