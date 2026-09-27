# AgriConnect (Prototype)

**Farm Inputs, Closer to You.** A platform that connects small-scale Filipino
farmers with verified agri-input suppliers. Farmers order fertilizer, seeds,
pesticides, and feeds by SMS, Facebook Messenger, or the app, in Tagalog,
Bisaya, or English. They compare quotations and track delivery to their barangay.

## Live demo

- **App:** https://agriconnect.onrender.com
- **API test page (Swagger):** https://agriconnect.onrender.com/api/docs
  (open an endpoint → **Try it out** → **Execute**)

Notes: the free server sleeps when idle, so the first request can take ~30
seconds. Demo data (4 verified suppliers, product catalog) is recreated on
every restart; anything added during testing is lost then. Texts are not
really sent — see them with `GET /api/sms/log`.

Suggested API walkthrough (all in Swagger):

1. `GET /products` — marketplace with the lowest supplier prices.
2. `POST /inbound/simulate` — a farmer texts `REG Maria Santos, Katipunan, M'lang` (registers by SMS).
3. `POST /inbound/simulate` — same sender texts `10 sako urea sa Katipunan`; the reply asks to confirm.
4. `POST /inbound/simulate` — same sender texts `OO`; a structured request is created.
5. `GET /requests` — the request, read from the text by the NLP parser.
6. `POST /quotes` (supplier 1 quotes the request) → `POST /quotes/{id}/accept` (creates an order)
   → `POST /orders/{id}/status` (`for_delivery`, `delivered`, then `completed`).
7. `GET /impact/summary` — the reports numbers.

## The process

The system follows a five-phase business process (BPMN):

1. **Registration & verification.** A farmer's first text starts a guided
   registration (name, barangay, municipality). Phone numbers are confirmed by
   OTP. A **barangay / LGU / cooperative** verifier approves each profile, and
   every decision is recorded.
2. **Request intake & AI processing.** The AI reads the message into a
   structured request: products (several per message), quantities, location,
   timing, intent, and a confidence score. The farmer confirms by replying
   **OO/YES**, or edits it. Staff can process and publish on a farmer's behalf.
3. **Demand aggregation & supplier matching.** Requests are pooled by product,
   barangay, and period. Verified suppliers who carry the product or cover the
   barangay are notified and send **quotations** with price, quantity, delivery
   option, and date.
4. **Order confirmation & fulfillment.** The farmer accepts a quotation (or
   negotiates in chat), which creates an order. The supplier moves it through
   *For Delivery → Delivered*, and the farmer gets updates by SMS or in the app.
5. **Completion & engagement.** The farmer confirms receipt and rates the
   supplier, earning **AgriPoints**. The Reports screen counts transactions,
   trips avoided, and savings.

## Who uses what

| Role | Main screens |
|---|---|
| Farmer | Dashboard, Marketplace, My Requests (quotations), Orders (tracking), Suppliers, Messages, AgriPoints, Community, Settings |
| Supplier | New Requests (All / Nearby / My Products), My Quotes, Orders, My Products, Pooled Demand, Messages |
| Barangay / LGU / Coop staff | Incoming Messages (SMS + Messenger → structured request → publish), Verification, Structured Requests, Orders, Suppliers, Reports, SMS & Messenger simulator |

Farmers without smartphones can do everything important by text: register
(`REG Name, Barangay, Town` or answer the questions), order in their own words,
confirm with `OO`, check `STATUS`, and receive quote and delivery updates.

## Tech stack

- **Frontend**: React + Vite + Tailwind CSS (`frontend/`)
- **Backend**: Node.js + Express (`backend/`), with Server-Sent Events for live updates
- **Database**: SQLite via `node:sqlite` (`backend/src/data/`), written to port to PostgreSQL later
- **AI/NLP**: Claude API (`claude-opus-5`, structured outputs, server-side refusal
  fallback), with an offline Tagalog/Bisaya/English rule-based parser as a fallback
- **Channels**: SMS (Semaphore / Twilio / console), Facebook Messenger (Send API
  + webhook), in-app chat, WebRTC voice calls

## Running the prototype (dev)

```bash
# Terminal 1 — backend API
cd backend
npm install
cp .env.example .env   # optional: ANTHROPIC_API_KEY, SMS/Messenger settings
npm run db:seed        # optional: 4 demo suppliers with prices
npm run dev            # migrates the database automatically on start

# Terminal 2 — frontend
cd frontend
npm install
npm run dev            # http://localhost:5173
```

To try the whole flow on one machine, open three browser tabs and sign up in
each: a **farmer**, a **supplier**, and **Barangay / LGU / Coop** staff (each
tab keeps its own account). As staff, use **SMS & Messenger** to text in as a
farmer, then **Verification** to approve them. With `SMS_PROVIDER=console`, OTP
codes are shown on screen and outgoing texts are printed in the backend log.

Without an `ANTHROPIC_API_KEY` everything still works: message reading falls
back to the offline parser, which is less accurate on unusual phrasing.

## Status and limits

This is a prototype. There are **no passwords or access control yet**: anyone
can open any role, and the API trusts the ids it's given. Add authentication
before real use. The live-update hub runs in memory, so run a single backend
process. Voice calls may need a TURN server on strict networks.

See `frontend/README.md`, `backend/README.md`, and [`docs/api.md`](docs/api.md).
