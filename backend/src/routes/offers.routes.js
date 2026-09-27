const express = require("express");
const { submitOffer, getOffersBySupplier, getFarmersForOffer } = require("../services/offers.service");
const { notifyFarmersOfOffer } = require("../services/notifications.service");

const router = express.Router();

router.post("/submit", (req, res, next) => {
  const {
    aggregated_demand_id,
    supplier_id,
    price_per_unit,
    available_quantity,
    min_order_quantity,
    proposed_delivery_date,
    delivery_point,
    offer_validity,
  } = req.body || {};

  if (!aggregated_demand_id || !supplier_id || price_per_unit == null || available_quantity == null) {
    return res.status(400).json({
      message: "aggregated_demand_id, supplier_id, price_per_unit, and available_quantity are required",
    });
  }

  try {
    const offer = submitOffer({
      aggregated_demand_id,
      supplier_id,
      price_per_unit,
      available_quantity,
      min_order_quantity,
      proposed_delivery_date,
      delivery_point,
      offer_validity,
    });
    res.status(201).json(offer);
    // Fire-and-forget: the offer is already saved and returned.
    notifyFarmersOfOffer(offer.id).catch((error) => console.error(`[notify] ${error.message}`));
  } catch (err) {
    next(err);
  }
});

router.get("/:offerId/farmers", (req, res, next) => {
  try {
    res.json(getFarmersForOffer(req.params.offerId));
  } catch (err) {
    next(err);
  }
});

router.get("/my-offers/:supplierId", (req, res, next) => {
  try {
    res.json(getOffersBySupplier(req.params.supplierId));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
