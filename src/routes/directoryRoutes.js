const express = require("express");
const directoryController = require("../controllers/directoryController");
const {
  authenticate,
  authorize,
  requireApprovedAlumni,
} = require("../middleware/authMiddleware");
const {
  directoryFilterValidation,
  validate,
} = require("../middleware/validation");

const router = express.Router();

router.use(authenticate, requireApprovedAlumni);

// Get filter options (no auth needed beyond base)
router.get("/filters", authenticate, directoryController.getFilterOptions);

router.get(
  "/alumni",
  authorize("student", "alumni", "admin"),
  directoryFilterValidation,
  validate,
  directoryController.listAlumni,
);

router.get(
  "/students",
  authorize("alumni", "admin"),
  directoryFilterValidation,
  validate,
  directoryController.listStudents,
);

module.exports = router;
