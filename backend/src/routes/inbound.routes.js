const express = require("express");
const {
  handleInbound,
  listInbound,
  getInbound,
  reprocessInbound,
  staffPublishInbound,
  dismissInbound,
} = require("../services/inbound.service");
const { handle } = require("../utils/route");

const router = express.Router();

// Staff inbox. ?channel=sms|messenger&status=
router.get("/", handle((req) => listInbound({ channel: req.query.channel, status: req.query.status })));

// Simulator: pretend a farmer texted. Body { channel, sender, message }
router.post(
  "/simulate",
  handle((req) => {
    const { channel, sender, message } = req.body || {};
    return handleInbound({ channel, sender, text: message });
  })
);

router.get("/:id", handle((req) => getInbound(req.params.id)));
router.post("/:id/process", handle((req) => reprocessInbound(req.params.id)));
// Body: optional corrections { items: [{product_name, quantity, unit}], preferred_date, preferred_date_iso, delivery_location, notes }
router.post("/:id/publish", handle((req) => staffPublishInbound(req.params.id, req.body || {})));
router.post("/:id/dismiss", handle((req) => dismissInbound(req.params.id)));

module.exports = router;
