const express = require("express");
const { listProducts, listPopularProducts, getProduct, search, CATEGORIES } = require("../services/catalog.service");
const { handle } = require("../utils/route");

const router = express.Router();

router.get("/", handle((req) => listProducts({ category: req.query.category, q: req.query.q })));
router.get("/categories", handle(() => CATEGORIES));
router.get("/popular", handle((req) => listPopularProducts(req.query.limit)));
router.get("/search", handle((req) => search(req.query.q)));
router.get("/:id", handle((req) => getProduct(req.params.id)));

module.exports = router;
