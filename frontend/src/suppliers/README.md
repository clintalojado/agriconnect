# Suppliers module

- `SupplierDashboard.jsx` — store identity (persisted to `localStorage`), an
  "Aggregated Demand" tab (table grouped by barangay/product, farmer count,
  viability status, filterable by barangay and product, with a "Respond"
  button that opens an offer form), and a "My Offers" tab listing everything
  submitted and its status. Talks to `/api/suppliers/register`,
  `/api/demand/aggregated`, `/api/offers/submit`, and
  `/api/offers/my-offers/:supplierId`.
