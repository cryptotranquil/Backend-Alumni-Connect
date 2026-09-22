const express = require("express");
const departmentController = require("../controllers/departmentController");

const router = express.Router();

// Public — used by the registration dropdown and anywhere else that just
// needs the active department list. No auth required.
router.get("/", departmentController.listActive);

module.exports = router;