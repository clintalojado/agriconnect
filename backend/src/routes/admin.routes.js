const express = require("express");
const { getOverview } = require("../services/admin.service");
const { handle } = require("../utils/route");

const router = express.Router();

router.get("/overview", handle(() => getOverview()));

module.exports = router;
