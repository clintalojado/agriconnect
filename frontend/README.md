# AgriConnect Frontend

React + Vite + Tailwind CSS single-page app.

## Run

```bash
npm install
npm run dev
```

Serves at `http://localhost:5173` and talks to the backend at
`http://localhost:4000/api` (override with `VITE_API_BASE_URL`).

## Structure

- `src/App.jsx` — providers and role-based routing (hash routes like `#/requests/12`).
- `src/shell/` — app shell: sidebar (desktop), bottom tabs (mobile), top bar
  with search, notifications, and account switcher; per-role menus in `nav.js`.
- `src/lib/` — router, session (the tab's active role: farmer / supplier / staff),
  live profile, live updates over SSE.
- `src/components/` — UI kit (`ui.jsx`), icons, illustrated product art,
  status labels, the BPMN process diagram, shared cards.
- `src/home/` — public landing page. `src/onboarding/` — sign-up per role (with OTP).
- `src/farmers/` — dashboard, marketplace, product details, create request
  (form or AI "type or speak it"), my requests, AgriPoints.
- `src/requests/` — request detail: quotations (farmer), send quote (supplier), reject (staff).
- `src/orders/` — order list and tracking timeline (all roles, role-specific actions).
- `src/suppliers/` — supplier home (new requests), quotes, products, pooled demand, directory, profile.
- `src/staff/` — staff dashboard, incoming messages, verification, requests.
- `src/admin/` — reports (impact charts) and the SMS & Messenger simulator.
- `src/messenger/`, `src/calls/` — chat, notifications tab, WebRTC voice calls.
- `src/community/`, `src/settings/` — community board, profile settings.

## Trying it on one computer

Each browser tab keeps its own active account, so open one tab per role
(farmer, supplier, staff) and switch between them. Calls need microphone
permission; `localhost` counts as a secure origin.
