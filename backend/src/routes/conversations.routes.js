const express = require("express");
const {
  getConversation,
  getOrCreateConversation,
  listConversations,
  getMessages,
  sendMessage,
  markRead,
} = require("../services/messages.service");
const { listCalls } = require("../services/calls.service");

const router = express.Router();

// Find-or-create the thread between a farmer and a supplier.
router.post("/", (req, res, next) => {
  const { farmer_id, supplier_id, offer_id } = req.body || {};
  if (!farmer_id || !supplier_id) {
    return res.status(400).json({ message: "farmer_id and supplier_id are required" });
  }
  try {
    res.status(201).json(getOrCreateConversation({ farmer_id, supplier_id, offer_id: offer_id || null }));
  } catch (err) {
    next(err);
  }
});

// GET /conversations?participant_type=farmer&participant_id=3
router.get("/", (req, res, next) => {
  const { participant_type, participant_id } = req.query;
  if (!participant_type || !participant_id) {
    return res.status(400).json({ message: "participant_type and participant_id are required" });
  }
  try {
    res.json(listConversations({ participant_type, participant_id: Number(participant_id) }));
  } catch (err) {
    next(err);
  }
});

router.get("/:id", (req, res, next) => {
  try {
    res.json(getConversation(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.get("/:id/messages", (req, res, next) => {
  try {
    res.json(getMessages(req.params.id, { after_id: req.query.after_id }));
  } catch (err) {
    next(err);
  }
});

router.post("/:id/messages", async (req, res, next) => {
  const { sender_type, body, send_sms } = req.body || {};
  try {
    const result = await sendMessage({ conversation_id: req.params.id, sender_type, body, send_sms: Boolean(send_sms) });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/:id/read", (req, res, next) => {
  try {
    res.json(markRead({ conversation_id: req.params.id, reader_type: (req.body || {}).reader_type }));
  } catch (err) {
    next(err);
  }
});

router.get("/:id/calls", (req, res, next) => {
  try {
    res.json(listCalls(req.params.id));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
