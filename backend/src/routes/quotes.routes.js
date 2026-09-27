const express = require("express");
const {
  sendQuote,
  listQuotesForSupplier,
  acceptQuote,
  declineQuote,
  withdrawQuote,
  negotiateQuote,
} = require("../services/quotes.service");
const { handle } = require("../utils/route");

const router = express.Router();

// Supplier: send or update a quotation. Body { request_id, supplier_id, price_per_unit, quantity?, delivery_fee?, delivery_date?, delivery_option?, note? }
router.post("/", handle((req) => sendQuote(req.body || {}), 201));

router.get("/supplier/:supplierId", handle((req) => listQuotesForSupplier(req.params.supplierId)));

// Farmer actions. Body { farmer_id }
router.post("/:id/accept", handle((req) => acceptQuote({ quote_id: req.params.id, farmer_id: (req.body || {}).farmer_id }), 201));
router.post("/:id/decline", handle((req) => declineQuote({ quote_id: req.params.id, farmer_id: (req.body || {}).farmer_id })));
router.post("/:id/negotiate", handle((req) => negotiateQuote({ quote_id: req.params.id, farmer_id: (req.body || {}).farmer_id })));

// Supplier action. Body { supplier_id }
router.post("/:id/withdraw", handle((req) => withdrawQuote({ quote_id: req.params.id, supplier_id: (req.body || {}).supplier_id })));

module.exports = router;
