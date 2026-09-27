const express = require("express");
const {
  findOrCreateSupplier,
  updateSupplier,
  getSupplierProfile,
  listSuppliers,
  setSupplierVerified,
} = require("../services/suppliers.service");
const { listSupplierProducts, upsertListing, deleteListing } = require("../services/catalog.service");
const { badRequest } = require("../utils/errors");
const { handle } = require("../utils/route");

const router = express.Router();

function requireName(body) {
  const { name } = body || {};
  if (typeof name !== "string" || !name.trim()) throw badRequest("name is required");
}

// Directory: ?q=&category=&all=1 (all=1 includes unverified, for staff)
router.get(
  "/",
  handle((req) => listSuppliers({ q: req.query.q, category: req.query.category, include_unverified: req.query.all === "1" }))
);

router.post(
  "/register",
  handle((req) => {
    requireName(req.body);
    return findOrCreateSupplier(req.body);
  }, 201)
);

// Profile with listings and reviews.
router.get("/:id", handle((req) => getSupplierProfile(req.params.id)));

router.patch(
  "/:id",
  handle((req) => {
    requireName(req.body);
    return updateSupplier(req.params.id, req.body);
  })
);

// Staff: verify / unverify a supplier. Body { verified: true|false }
router.post("/:id/verification", handle((req) => setSupplierVerified(req.params.id, Boolean((req.body || {}).verified))));

// "My Products" listings
router.get("/:id/products", handle((req) => listSupplierProducts(req.params.id)));
router.put("/:id/products/:productId", handle((req) => upsertListing(req.params.id, { ...req.body, product_id: req.params.productId })));
router.delete("/:id/products/:productId", handle((req) => deleteListing(req.params.id, req.params.productId)));

module.exports = router;
