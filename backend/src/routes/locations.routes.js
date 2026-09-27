const express = require("express");
const { MUNICIPALITY, MLANG_BARANGAYS } = require("../services/locations");
const { handle } = require("../utils/route");

const router = express.Router();

// Barangay list for the registration and profile forms.
router.get("/", handle(() => ({ municipality: MUNICIPALITY, barangays: MLANG_BARANGAYS })));

module.exports = router;
