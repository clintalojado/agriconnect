const express = require("express");
const { findOrCreateFarmer, updateFarmer, getFarmer, listFarmers } = require("../services/farmers.service");
const {
  decideFarmerVerification,
  listVerificationRecords,
  sendOtp,
  confirmOtp,
} = require("../services/verification.service");
const { getPoints } = require("../services/points.service");
const { badRequest } = require("../utils/errors");
const { handle } = require("../utils/route");

const router = express.Router();

function isBlank(value) {
  return typeof value !== "string" || !value.trim();
}

function requireProfile(body) {
  const { name, barangay, municipality } = body || {};
  if (isBlank(name) || isBlank(barangay) || isBlank(municipality)) {
    throw badRequest("name, barangay, and municipality are required");
  }
}

// Staff: all farmers, pending verification first. ?status=pending&q=
router.get("/", handle((req) => listFarmers({ status: req.query.status, q: req.query.q })));

router.post(
  "/register",
  handle((req) => {
    requireProfile(req.body);
    const { name, phone_number, barangay, municipality } = req.body;
    return findOrCreateFarmer({ name, phone_number, barangay, municipality });
  }, 201)
);

router.get("/:id", handle((req) => getFarmer(req.params.id)));

router.patch(
  "/:id",
  handle((req) => {
    requireProfile(req.body);
    const { name, phone_number, barangay, municipality } = req.body;
    return updateFarmer(req.params.id, { name, phone_number, barangay, municipality });
  })
);

// Phone ownership (OTP)
router.post("/:id/otp", handle((req) => sendOtp(req.params.id)));
router.post("/:id/otp/verify", handle((req) => confirmOtp(req.params.id, (req.body || {}).code)));

// Barangay / LGU / cooperative verification
router.post(
  "/:id/verification",
  handle((req) => {
    const { decision, verifier_name, note } = req.body || {};
    return decideFarmerVerification({ farmer_id: req.params.id, decision, verifier_name, note });
  })
);
router.get("/:id/verification", handle((req) => listVerificationRecords(req.params.id)));

router.get("/:id/points", handle((req) => (getFarmer(req.params.id), getPoints(req.params.id))));

module.exports = router;
