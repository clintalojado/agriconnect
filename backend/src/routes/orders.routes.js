const express = require("express");
const { listOrders, getOrder, updateOrderStatus, reviewOrder } = require("../services/orders.service");
const { handle } = require("../utils/route");

const router = express.Router();

// ?farmer_id= | ?supplier_id= | neither (staff), plus optional &status=
router.get(
  "/",
  handle((req) => listOrders({ farmer_id: req.query.farmer_id, supplier_id: req.query.supplier_id, status: req.query.status }))
);

router.get("/:id", handle((req) => getOrder(req.params.id)));

// Body { actor_type: farmer|supplier|staff, actor_id, status, delivery_date? }
router.post("/:id/status", handle((req) => updateOrderStatus({ ...(req.body || {}), order_id: req.params.id })));

// Body { farmer_id, rating 1-5, comment? }
router.post("/:id/review", handle((req) => reviewOrder({ ...(req.body || {}), order_id: req.params.id })));

module.exports = router;
