const express = require("express");
const jobController = require("../controllers/jobController");
const {
  authenticate,
  authorize,
  requireApprovedAlumni,
} = require("../middleware/authMiddleware");
const { createJobValidation, validate } = require("../middleware/validation");

const router = express.Router();

router.use(authenticate, requireApprovedAlumni);

// Public routes (students can view approved jobs)
router.get("/", jobController.listJobs);
router.get("/filters", jobController.getJobFilters);
router.get("/stats", jobController.getJobStats);

// Alumni can post jobs
// Alumni and students (e.g. student business owners) can post jobs
router.post(
  "/",
  authorize("alumni", "student", "admin"),
  createJobValidation,
  validate,
  jobController.createJob,
);
// Student can apply; alumni can refer a student.
router.post("/:id/apply", authorize("student"), jobController.applyJob);
router.post(
  "/:id/refer",
  authorize("alumni", "admin"),
  jobController.referStudent,
);
router.get("/:id/refer-status", jobController.referralStatus);

// Update job (owner or admin)
router.put(
  "/:id",
  authorize("alumni", "student", "admin"),
  createJobValidation,
  validate,
  jobController.updateJob,
);

// Delete job (owner or admin)
router.delete("/:id", jobController.deleteJob);

// Admin only
router.put("/:id/approve", authorize("admin"), jobController.approveJob);

module.exports = router;
