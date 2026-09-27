const express = require("express");
const { startCall, updateCallStatus, relaySignal } = require("../services/calls.service");

const router = express.Router();

router.post("/start", async (req, res, next) => {
  const { conversation_id, caller_type } = req.body || {};
  if (!conversation_id || !caller_type) {
    return res.status(400).json({ message: "conversation_id and caller_type are required" });
  }
  try {
    res.status(201).json(await startCall({ conversation_id, caller_type }));
  } catch (err) {
    next(err);
  }
});

router.post("/:id/status", async (req, res, next) => {
  const { status } = req.body || {};
  if (!status) {
    return res.status(400).json({ message: "status is required" });
  }
  try {
    res.json(await updateCallStatus({ call_id: req.params.id, status }));
  } catch (err) {
    next(err);
  }
});

router.post("/:id/signal", (req, res, next) => {
  const { from_type, data } = req.body || {};
  try {
    res.json(relaySignal({ call_id: req.params.id, from_type, data }));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
