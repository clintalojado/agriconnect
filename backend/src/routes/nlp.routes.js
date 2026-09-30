const express = require("express");
const { extractFarmInputRequest, getNlpStatus } = require("../services/nlp.service");
const { classifyIntent, modelInfo } = require("../services/nlp/intent");

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

// ML intent classifier: what is this message about?
router.post("/intent", (req, res) => {
  const { message } = req.body || {};
  if (typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ message: "message is required" });
  }
  res.json({ message, ...classifyIntent(message) });
});

router.get("/intent/model", (req, res) => {
  res.json(modelInfo());
});

module.exports = router;
