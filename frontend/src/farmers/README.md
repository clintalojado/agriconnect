# Farmers module

- `RequestForm.jsx` — identity panel (persisted to `localStorage`), a "New
  Request" tab (free-text message → AI-extracted fields shown for
  review/correction with per-field confidence styling → confirm), and a "My
  Requests" tab listing past requests with status badges and an expandable
  offers view per request. Talks to `/api/farmers/register`,
  `/api/requests/submit`, `/api/requests/validate`, `/api/requests/:farmerId`.
- `OffersForRequest.jsx` — for a given request, lists matching supplier
  offers (supplier name, price, availability, delivery info) with
  Accept/Request Revision/Decline actions and a running confirmed-farmer
  summary after accepting. Talks to `/api/confirmations/offers/:requestId`,
  `/api/confirmations/accept`, `/api/confirmations/decline`,
  `/api/confirmations/revise`. Reused in both tabs of `RequestForm.jsx`.
