const express = require("express");
const { getAggregatedDemand, runDemandAggregation } = require("../services/aggregation.service");

const router = express.Router();

router.get("/aggregated", (req, res, next) => {
  try {
    res.json(getAggregatedDemand());
  } catch (err) {
    next(err);
  }
});

router.get("/aggregated/:barangay", (req, res, next) => {
  try {
    res.json(getAggregatedDemand({ barangay: req.params.barangay }));
  } catch (err) {
    next(err);
  }
});

router.post("/aggregate", (req, res, next) => {
  try {
    const { periodType, viabilityThreshold } = req.body || {};
    const summary = runDemandAggregation({ periodType, viabilityThreshold });
    res.json({ message: "Aggregation complete", summary });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
