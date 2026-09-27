const express = require("express");
const { getImpactSummary } = require("../services/impact.service");

const router = express.Router();

router.get("/summary", (req, res, next) => {
  const { barangay, start_date, end_date } = req.query;
  try {
    res.json(getImpactSummary({ barangay, startDate: start_date, endDate: end_date }));
  } catch (err) {
    next(err);
  }
});

router.get("/barangay/:barangay", (req, res, next) => {
  const { start_date, end_date } = req.query;
  try {
    res.json(getImpactSummary({ barangay: req.params.barangay, startDate: start_date, endDate: end_date }));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
