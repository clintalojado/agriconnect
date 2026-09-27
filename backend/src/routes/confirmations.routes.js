const express = require("express");
const { getOffersForRequest, respondToOffer } = require("../services/confirmations.service");

const router = express.Router();

router.get("/offers/:requestId", (req, res, next) => {
  try {
    res.json(getOffersForRequest(req.params.requestId));
  } catch (err) {
    next(err);
  }
});

function respond(status) {
  return (req, res, next) => {
    const { request_id, offer_id, farmer_id } = req.body || {};

    if (!request_id || !offer_id || !farmer_id) {
      return res.status(400).json({ message: "request_id, offer_id, and farmer_id are required" });
    }

    try {
      const summary = respondToOffer({ request_id, offer_id, farmer_id, status });
      res.json(summary);
    } catch (err) {
      next(err);
    }
  };
}

router.post("/accept", respond("accepted"));
router.post("/decline", respond("declined"));
router.post("/revise", respond("revision_requested"));

module.exports = router;
