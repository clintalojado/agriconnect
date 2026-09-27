const express = require("express");
const {
  createStructuredRequest,
  submitFarmInputRequest,
  validateFarmInputRequest,
  rejectRequest,
  getRequestsByFarmer,
  getRequestDetail,
  listOpenRequestsForSupplier,
  listAllRequests,
} = require("../services/requests.service");
const { badRequest } = require("../utils/errors");
const { handle } = require("../utils/route");

const router = express.Router();

// Structured request (Create Request form / "Add to Request").
router.post("/create", handle((req) => createStructuredRequest({ ...(req.body || {}), channel: "app" }), 201));

// AI flow: read the farmer's own words into a draft…
router.post(
  "/submit",
  handle((req) => {
    const { farmer_id, raw_message } = req.body || {};
    if (!farmer_id || typeof raw_message !== "string" || !raw_message.trim()) {
      throw badRequest("farmer_id and raw_message are required");
    }
    return submitFarmInputRequest({ farmer_id, raw_message });
  }, 201)
);

// …then the farmer confirms the corrected draft.
router.post(
  "/validate",
  handle((req) => {
    if (!(req.body || {}).id) throw badRequest("id is required");
    return validateFarmInputRequest(req.body);
  })
);

// Staff: every request. ?status= (display status or raw status)
router.get("/", handle((req) => listAllRequests({ status: req.query.status })));

// Supplier "New Requests" feed. ?filter=all|nearby|my_products
router.get("/open/:supplierId", handle((req) => listOpenRequestsForSupplier(req.params.supplierId, { filter: req.query.filter })));

router.get("/detail/:id", handle((req) => getRequestDetail(req.params.id)));

router.post("/:id/reject", handle((req) => rejectRequest(req.params.id, req.body || {})));

// A farmer's requests, newest first (kept at this path for compatibility).
router.get("/:farmerId", handle((req) => getRequestsByFarmer(req.params.farmerId)));

module.exports = router;
