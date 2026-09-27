const express = require("express");
const { extractFarmInputRequest, getNlpStatus } = require("../services/nlp.service");

const router = express.Router();

router.get("/status", (req, res) => {
  res.json(getNlpStatus());
});

router.post("/extract", async (req, res, next) => {
  const { raw_message, barangay } = req.body || {};

  try {
    const extraction = await extractFarmInputRequest(raw_message, { profileBarangay: barangay || null });
    res.json(extraction);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
