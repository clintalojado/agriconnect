# AgriConnect API Reference

Base URL: `http://localhost:4000/api` (configurable via `PORT` in `backend/.env`).

All responses are JSON. Errors return `{ "message": "..." }` with the status
codes below. Every route listed here is backed by a real service — none of
this is a stub.

## Status code conventions

| Code | Meaning |
|---|---|
| 200 | Successful GET, or an action that doesn't create a new row |
| 201 | Successful POST that creates a new row |
| 400 | Bad input — missing/invalid fields, or a referenced id that doesn't exist |
| 403 | Not allowed for this account (e.g. unverified supplier quoting, another farmer's quotation) |
| 404 | The specific resource named in the URL path doesn't exist |
| 409 | Conflicts with the current state (e.g. quoting after the farmer already accepted a quotation) |
| 422 | Well-formed request, but the NLP model declined to process it |
| 429 | NLP service rate-limited — retry later |
| 500 | Unexpected server error, or the NLP service is misconfigured (missing/invalid API key) |
| 502 | The NLP upstream returned an error or an unparsable response |

Unmatched routes return `404 { "message": "Not found: <METHOD> <path>" }`.
Malformed JSON request bodies return `400` (handled by Express's JSON parser).

## Health

`GET /health` → `{ status: "ok" }`

## Locations

`GET /locations` → `{ municipality: "M'lang", barangays: [...] }` — the 37
official barangays of M'lang, used for form suggestions. Barangays saved on
farmers, suppliers (including `coverage_barangays`), and read from messages
are normalized to these spellings ("pulang lupa" → `Pulang-lupa`), and the
NLP recognizes them even without "Brgy." in front. Other barangays are
accepted as typed.

## Farmers

New farmers start as `verification_status: "pending"` (unless
`FARMER_VERIFICATION=auto`). Their requests are stored but held — not pooled
or shown to suppliers — until a barangay / LGU / cooperative verifier approves them.

`POST /farmers/register`
- Body: `{ name, phone_number?, barangay, municipality }`
- → `201` farmer row (`verification_status`, `phone_verified`, …). Idempotent
  by phone number in any format (`0917…`, `+63917…`, `63917…`).
- → `400` if `name`, `barangay`, or `municipality` is missing or blank.

`GET /farmers?status=&q=` → staff list, pending first, with `request_count`
and `last_verification_note`. `status`: pending | more_info | verified | rejected.

`GET /farmers/:id` → `200` farmer row. `404` if missing.

`PATCH /farmers/:id` — Body `{ name, phone_number?, barangay, municipality }`.
Edits in place; a changed phone number must be confirmed again. → `200`;
`400` missing fields or phone taken; `404`.

`POST /farmers/:id/otp` — texts a 6-digit code to the farmer's phone (valid
10 minutes). → `200 { sent, phone, ttl_minutes, dev_code? }` — `dev_code` only
with `SMS_PROVIDER=console`. `400` if the farmer has no phone number.

`POST /farmers/:id/otp/verify` — Body `{ code }` → `200` farmer
(`phone_verified: 1`). `400` wrong or expired code (5 tries per code).

`POST /farmers/:id/verification` — the verifier's decision.
- Body: `{ decision: approved | more_info | rejected, verifier_name, note? }`
  (`note` is required unless approving).
- Writes a verification record, updates the farmer, texts them, and on
  approval pools their held requests and notifies matching suppliers.
- → `200 { farmer, released_requests }`.

`GET /farmers/:id/verification` → the farmer's verification records, newest first.

`GET /farmers/:id/points` → `{ total, tier, next_tier, history, ways_to_earn }`.
Points: request submitted +2, order completed +10, supplier rated +5,
community post +1 (each awarded once).

## Requests

Each request is one product. Every request row carries `display_status`:
`draft` · `awaiting_verification` · `for_quotation` · `supplier_confirmed` ·
`for_delivery` · `delivered` · `completed` · `rejected`, plus `quote_count`,
`best_quote_price`, and the active order (`order_id`, `order_code`,
`order_status`, `order_total`, `order_supplier_name`).

`POST /requests/create` — structured request (Create Request form / "Add to Request").
- Body: `{ farmer_id, product_id | product_name, quantity, unit?, needed_by? (YYYY-MM-DD),
  preferred_date?, delivery_location?, notes?, preferred_supplier_id? }`
- Stored as `validated`. If the farmer is verified it is pooled, and matching
  verified suppliers are notified (the preferred supplier also by SMS).
- → `201` request. `400` bad product, quantity, unit, or date.

`POST /requests/submit` — AI flow step 1: `{ farmer_id, raw_message }` →
`201 { request, extraction }` (a `draft`). See **NLP** for extraction errors.

`POST /requests/validate` — AI flow step 2: the farmer confirms the draft.
Body `{ id, product_name, quantity, unit, barangay, preferred_date?, needed_by? }`.
→ `200` request. `400` invalid fields, or the request is no longer a draft.

`GET /requests/:farmerId` → the farmer's requests, newest first.

`GET /requests/detail/:id` → request plus `quotes` (supplier name, rating,
verified, `total`), accepted first, then cheapest.

`GET /requests/open/:supplierId?filter=all|nearby|my_products` — supplier feed:
open requests from verified farmers with no order yet, each with `nearby`,
`my_product`, and the supplier's own `my_quote`.

`GET /requests?status=` → staff list of all requests.

`POST /requests/:id/reject` — staff. Body `{ reason? }`. `400` if it already has an order.

## NLP

`POST /nlp/extract`
- Body: `{ raw_message, barangay? }` — `barangay` is the farmer's profile
  barangay, used when the message doesn't name one.
- → `200`:
  ```json
  {
    "product_name": "Urea (46-0-0)", "quantity": 10, "unit": "sacks",
    "barangay": "San Isidro", "barangay_source": "message",
    "preferred_date": "before May", "preferred_date_iso": "2027-04-30",
    "intent": "purchase_request", "language": "tagalog",
    "additional_items": [{ "product_name": "...", "quantity": 2, "unit": "sacks" }],
    "missing_fields": [],
    "clarification_question": null,
    "reply_message": "Salamat po! Natanggap namin ...",
    "confidence": { "product_name": 0.9, "quantity": 0.9, "unit": 0.9, "barangay": 0.8, "preferred_date": 0.8 },
    "source": "ai"
  }
  ```
  - `intent`: `purchase_request` | `inquiry` | `other`.
  - `language`: `tagalog` | `bisaya` | `english` | `mixed` | `other`.
  - Product and unit names are normalized to canonical forms (e.g. "sako"
    → `sacks`, "amsul" → `Ammonium sulfate (21-0-0)`) so aggregation groups
    requests consistently.
  - `barangay_source`: `message`, `profile` (filled from the `barangay`
    body field), or `null`.
  - `missing_fields`: which of `product_name`, `quantity`, `barangay` are still empty.
  - `clarification_question` / `reply_message`: short text in the farmer's
    language, suitable for SMS.
  - `source`: `ai` (Claude) or `rules` (offline parser). When the rules
    parser was used as a fallback, `fallback_reason` says why.
- → `400` `raw_message` missing/empty.
- → `422` the model declined to process the message (safety refusal).
- With `NLP_MODE=ai` only (in the default `auto` mode these fall back to the
  rules parser instead): `429` rate-limited, `500` misconfigured (missing or
  invalid `ANTHROPIC_API_KEY`), `502` upstream error or unparsable output.

`GET /nlp/status` → `200 { mode, active_engine, last_engine }` — `mode` is
`NLP_MODE`; `active_engine` is `ai` or `rules`; `last_engine` is what handled
the most recent message (`null` before the first).

## Demand aggregation

`GET /demand/aggregated` → `200` array of all `aggregated_demand` rows, each
with a live `farmer_count`.

`GET /demand/aggregated/:barangay` → `200` array filtered to that barangay
(empty array if none).

`POST /demand/aggregate`
- Body: `{ periodType?: "monthly" | "weekly", viabilityThreshold?: number }` (both optional, default monthly / 20 units)
- Adds newly validated requests (grouped by product/barangay/unit) to the
  current period's pool — each request is counted exactly once — flags pools
  meeting the threshold as `market_viable`, and advances the requests to
  `aggregated`. Pools that are `offered`/`closed` keep their status.
  Requests whose unit differs from the existing pool's unit (e.g. kg into a
  sacks pool) are left `validated` and logged, not mixed in.
- Also runs automatically whenever a request is validated (web or SMS).
- → `200 { message, summary }` — `summary` is grouped by barangay.
- Also runs automatically every day at midnight via the cron job in
  `backend/src/jobs/aggregateDemand.job.js`.

## Suppliers

Only **verified** suppliers appear to farmers, get request notifications, and
can send quotations.

`GET /suppliers?q=&category=&all=1` → directory with `rating`, `review_count`,
`product_count`, `categories`, `completed_orders`. `all=1` includes unverified (staff).

`POST /suppliers/register`
- Body: `{ name, contact_person?, phone?, barangay?, municipality?, coverage_barangays? }`
- → `201` supplier (`verified: false`). Idempotent by phone. `400` if `name` is missing.

`GET /suppliers/:id` → profile with `listings` and recent `reviews`. `404` if missing.

`PATCH /suppliers/:id` — same body as register. → `200`; `400`; `404`.

`POST /suppliers/:id/verification` — staff. Body `{ verified: true | false }`.

`GET /suppliers/:id/products` → the supplier's listings.
`PUT /suppliers/:id/products/:productId` — Body `{ price, unit?, in_stock?, brand? }` → the upserted listing.
`DELETE /suppliers/:id/products/:productId` → `{ deleted: true }`.

## Products (marketplace)

The catalog is seeded by the migration (canonical names match what the NLP
service produces). Prices come from verified suppliers' in-stock listings.

`GET /products?category=&q=` → products with `min_price`, `price_unit`,
`location`, `supplier_count`, `rating`, `review_count`, `request_count`.
Categories: seeds, fertilizer, pesticide, feeds, tools.

`GET /products/popular?limit=` → most requested first.

`GET /products/:id` → product plus `listings` (supplier, location, price, stock, rating).

`GET /products/search?q=` → `{ products, suppliers, barangays }` (top-bar search, 2+ characters).

## Quotations

`POST /quotes` — a supplier sends or updates a quotation.
- Body: `{ request_id, supplier_id, price_per_unit, quantity?, delivery_fee?,
  delivery_option?: delivery | pickup, delivery_date?, note? }`
- → `201` quote with `total`. `403` unverified supplier. `409` the farmer
  already accepted a quotation. `400` invalid numbers or the request isn't open.
- The farmer gets a notification and an SMS.

`GET /quotes/supplier/:supplierId` → the supplier's quotations, with order info.

`POST /quotes/:id/accept` — Body `{ farmer_id }`. Creates the order (code
`AC-YYYY-NNNN`), declines the request's other quotations, and notifies every
supplier involved. → `201` order. `403` not the farmer's request.

`POST /quotes/:id/decline` — Body `{ farmer_id }`.

`POST /quotes/:id/negotiate` — Body `{ farmer_id }` → the farmer–supplier
conversation, with the quotation posted in it as a system message.

`POST /quotes/:id/withdraw` — Body `{ supplier_id }` (pending quotations only).

## Orders

Status flow: `confirmed` → `for_delivery` → `delivered` → `completed`, or
`cancelled` from `confirmed` (which reopens the request for quotations).

`GET /orders?farmer_id=|supplier_id=&status=` → orders (all orders for staff).

`GET /orders/:id` → order plus `timeline`: request created, quotations
received, supplier confirmed, for delivery, delivered, completed (each with
`at` and `done`).

`POST /orders/:id/status` — Body `{ actor_type: farmer | supplier | staff, actor_id, status, delivery_date? }`.
- Suppliers: confirmed → for_delivery | cancelled; for_delivery → delivered.
- Farmers: confirmed → cancelled; for_delivery | delivered → completed.
- Staff: any of those.
- → `200` order. `403` not their order. `400` invalid move. Completing awards 10 AgriPoints.

`POST /orders/:id/review` — Body `{ farmer_id, rating 1–5, comment? }`,
completed orders only. → `{ order, points_awarded }`.

## Offers

`POST /offers/submit`
- Body: `{ aggregated_demand_id, supplier_id, price_per_unit, available_quantity, min_order_quantity?, proposed_delivery_date?, delivery_point?, offer_validity? }`
- Flips the aggregated demand's status to `offered` if it was
  `collecting`/`market_viable` (an `offered`/`closed` entry is left alone).
- → `201` offer row.
- → `400` missing required fields; `price_per_unit` or `available_quantity`
  not a positive number; `min_order_quantity` outside 0…`available_quantity`;
  unknown `aggregated_demand_id`/`supplier_id`; or the pool is `closed`.

`GET /offers/my-offers/:supplierId` → `200` array of the supplier's offers,
each joined with the demand's `product_name`, `barangay`, `time_period`, and
`unit` (as `demand_unit`).

`GET /offers/:offerId/farmers` → `200` array of farmers who responded to the
offer: `{ id, name, phone_number, barangay, confirmation_status, quantity, unit }`.

After a successful `POST /offers/submit`, every farmer with a `validated` or
`aggregated` request for the same product and barangay gets a live
`notification` event and, if they have a phone number, an SMS.

## Confirmations

`GET /confirmations/offers/:requestId`
- → `200 { request, offers }` — offers are matched to the request by
  product + barangay, each including `my_status` (this request's prior
  response to that offer, if any).
- → `404` request not found.

`POST /confirmations/accept` · `/decline` · `/revise`
- Body: `{ request_id, offer_id, farmer_id }`
- Upserts the farmer's response (a farmer can change their mind — re-posting
  updates the existing row rather than duplicating it). Multiple different
  farmers can accept the same offer independently.
- → `200 { offer, confirmed_farmer_count, confirmed_quantity }` — the counts
  are summed live from all accepted confirmations on that offer, not a
  stored column.
- → `400` missing fields, unknown `request_id`/`offer_id`/`farmer_id`, or the
  request belongs to a different farmer.

## Deliveries

`POST /deliveries/schedule`
- Body: `{ supplier_offer_id, scheduled_date?, delivery_point? }`
- → `201` delivery row.
- → `400` missing `supplier_offer_id`, unknown offer, or a delivery is
  already scheduled for that offer (one delivery per offer).

`PATCH /deliveries/:id/complete`
- Marks the delivery `completed` and writes an `impact_records` row:
  `farmers_served` (distinct farmers with an accepted confirmation on that
  offer) × 1 trip avoided each × ₱150/trip (see `AVG_TRIPS_SAVED_PER_FARMER`
  / `COST_PER_TRIP_PHP` in `deliveries.service.js`).
- → `200` updated delivery row. Idempotent — completing an already-completed
  delivery just returns it without writing a second impact record.
- → `404` delivery not found.

## Impact

`GET /impact/summary?barangay=&start_date=&end_date=`
`GET /impact/barangay/:barangay?start_date=&end_date=`

Both optional-filtered the same way; the second is a convenience wrapper
that pins `barangay` from the path. `start_date`/`end_date` are
`YYYY-MM-DD` and inclusive (the whole end date is included).

→ `200`:
```json
{
  "farmers": { "total": 0, "active": 0 },
  "requests": { "submitted": 0, "aggregated": 0, "fulfilled": 0 },
  "supplier_response_rate_pct": 0,
  "orders": { "confirmed": 0, "completed": 0 },
  "impact": { "trips_avoided": 0, "estimated_savings_php": 0 },
  "avg_fulfillment_days": null,
  "top_products_by_barangay": {
    "<barangay>": [{ "product_name": "", "total_quantity": 0, "request_count": 0 }]
  }
}
```

- `active` farmers = distinct farmers with at least one request (in the
  filtered range).
- `fulfilled` requests = requests whose farmer accepted an offer that went
  on to a completed delivery.
- `supplier_response_rate_pct` = % of aggregated demand pools that received
  at least one supplier offer.
- `avg_fulfillment_days` = average days between request creation and
  delivery completion, across fulfilled requests (`null` if none yet).
- `top_products_by_barangay` lists up to the top 3 products per barangay by
  total requested quantity.

## Messenger (conversations)

One conversation per farmer/supplier pair. Participants are identified by
`participant_type` (`farmer` | `supplier`) plus their id — there is no auth in
the prototype.

`POST /conversations`
- Body: `{ farmer_id, supplier_id, offer_id? }` — find-or-create.
- → `201` conversation row, joined with `farmer_name`, `farmer_phone`,
  `farmer_barangay`, `supplier_name`, `supplier_phone`, `supplier_contact`.
- → `400` missing or unknown ids.

`GET /conversations?participant_type=&participant_id=`
- → `200` that participant's conversations, most recent first, each with
  `last_message`, `last_sender_type`, `unread_count`, and `counterpart_online`.

`GET /conversations/:id` → `200` conversation. `404` if missing.

`GET /conversations/:id/messages?after_id=` → `200` messages, oldest first:
`{ id, conversation_id, sender_type (farmer|supplier|system), body, channel (app|sms), created_at, read_at }`.

`POST /conversations/:id/messages`
- Body: `{ sender_type, body, send_sms? }` — `body` up to 2000 characters.
  With `send_sms: true` the recipient also gets the message as a text.
- → `201 { message, sms }` — `sms` is the SMS log row (or `null`); a failed
  SMS doesn't fail the request, check `sms.status`.

`POST /conversations/:id/read` — Body `{ reader_type }`. Marks the other
side's messages read. → `200 { updated }`.

`GET /conversations/:id/calls` → `200` the conversation's call log (latest 50).

## Voice calls

Audio flows browser-to-browser over WebRTC; these endpoints keep the call
log and relay signaling over the realtime stream.

`POST /calls/start`
- Body: `{ conversation_id, caller_type }`.
- → `201 { call, callee_online }`. If the callee has no open AgriConnect tab,
  the call is logged as `missed` immediately, a system message is added to
  the conversation, and the callee gets a missed-call SMS.
- Otherwise the callee receives a `call:incoming` event.

`POST /calls/:id/status`
- Body: `{ status }` — `answered` | `declined` | `missed` | `ended` | `failed`.
  Allowed moves: `ringing` → any; `answered` → `ended`/`failed`. Repeating the
  current status is a no-op.
- Both sides get a `call:update` event. An answered call that ends adds a
  "Voice call · 2m 05s" system message; an unanswered one is treated as
  missed (system message + SMS).
- → `200` call row. `400` invalid transition. `404` unknown call.

`POST /calls/:id/signal`
- Body: `{ from_type, data }` — `data` is an SDP offer/answer or ICE candidate.
- Relayed to the other side as a `call:signal` event `{ call_id, from_type, data }`.
- → `200 { delivered }` (number of the other side's open tabs). `400` if the call already ended.

## SMS & Messenger intake

Farmers' texts arrive by SMS (gateway webhook) or Facebook Messenger
(webhook). Both go through the same handler:

1. `HELP` / `TULONG` / `TABANG` / `INFO` → instructions.
2. **Unregistered sender** → a registration conversation (name → barangay →
   municipality → mobile number for Messenger → confirm with OO). The first
   message is kept and processed after registration. `REG Name, Barangay, Town[, phone]`
   registers in one text. SMS registrations are phone-verified by the channel;
   a Messenger user's phone gets an OTP they reply with (or `SKIP`).
3. `STATUS` → the farmer's latest requests.
4. Anything else is read by the NLP service into a **structured request**
   (possibly several products) with a confidence score:
   - missing product, quantity, or unit → the reply asks for it
     (`needs_info`); the next text within 24 hours is read together with it;
   - complete → the reply lists the items and asks the farmer to reply
     **OO/YES** (`awaiting_confirmation`); a correction text is merged instead;
   - `OO` → one request per product is stored (`published`);
   - a price question → the lowest verified listing price.
5. Every order-type message also lands in the staff inbox (below).

`POST /sms/inbound` — SMS gateway webhook. JSON `{ from, message }` or a
Twilio form `{ From, Body }`. Optional `SMS_WEBHOOK_SECRET` (`?secret=` or
`X-Webhook-Secret`). → `200 { reply, farmer, inbound, requests, extraction,
registration }`, or empty TwiML for Twilio.

`GET /messenger/webhook` — Meta's verification (`hub.verify_token` must equal
`MESSENGER_VERIFY_TOKEN`). `POST /messenger/webhook` — page events, answered
`200 EVENT_RECEIVED` right away. With `MESSENGER_APP_SECRET` set, the
`X-Hub-Signature-256` header must match.

`GET /sms/log?limit=&phone=&channel=sms|messenger` → text log, newest first.

`GET /sms/status` → `{ provider, messenger: facebook | console }`.

## Staff inbox

`GET /inbound?channel=&status=` → `{ items, open_counts }`. Each item has the
original `body`, the `extraction` (`items`, `barangay`, `preferred_date`,
`preferred_date_iso`, `intent`, `language`, `confidence`, `source`), a `status`
(new · needs_info · awaiting_confirmation · answered · published · dismissed),
and the farmer's name and verification status.

`POST /inbound/simulate` — Body `{ channel, sender, message }`: act as a farmer (the staff simulator).

`POST /inbound/:id/process` — re-read the message with the NLP service (no text is sent).

`POST /inbound/:id/publish` — staff publishes for the farmer (assisted mode),
optionally with corrections `{ items: [{ product_name, quantity, unit }],
preferred_date, preferred_date_iso, delivery_location, notes }`. The farmer
is texted the confirmation. → `{ inbound, requests, reply }`.

`POST /inbound/:id/dismiss`.

## Notifications, community, staff overview

`GET /notifications?recipient_type=farmer|supplier&recipient_id=` → `{ items, unread }`.
`POST /notifications/read` — Body `{ recipient_type, recipient_id, ids? }` (all when `ids` is omitted).

`GET /community/posts?barangay=` · `POST /community/posts` `{ author_type, author_id, body }` ·
`GET /community/posts/:id/comments` · `POST /community/posts/:id/comments` `{ author_type, author_id, body }`.

`GET /admin/overview` → counters for the staff dashboard (inbox, farmers to
verify, unverified suppliers, requests without quotes, orders by status).

## Realtime stream

`GET /realtime/stream?farmer=<id>` | `?supplier=<id>` | `?staff=1` — a
Server-Sent Events stream. Events: `ready`, `message`, `read`,
`notification`, `call:incoming`, `call:signal`, `call:update`, and for staff
`inbound` and `verification`. A comment heartbeat is sent every 25 seconds.
The hub is in-memory, so it works with a single backend process only.
