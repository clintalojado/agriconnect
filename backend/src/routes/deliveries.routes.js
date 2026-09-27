const express = require("express");
const { scheduleDelivery, completeDelivery } = require("../services/deliveries.service");

const router = express.Router();

router.post("/schedule", (req, res, next) => {
  const { supplier_offer_id, scheduled_date, delivery_point } = req.body || {};

  if (!supplier_offer_id) {
    return res.status(400).json({ message: "supplier_offer_id is required" });
  }

  try {
    const delivery = scheduleDelivery({ supplier_offer_id, scheduled_date, delivery_point });
    res.status(201).json(delivery);
  } catch (err) {
    next(err);
  }
});

router.patch("/:id/complete", (req, res, next) => {
  try {
    const delivery = completeDelivery(req.params.id);
    res.json(delivery);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
