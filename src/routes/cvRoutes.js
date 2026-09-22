const express = require("express");
const router = express.Router();
const cvController = require("../controllers/cvController");
const {
  authenticate,
  requireApprovedAlumni,
} = require("../middleware/authMiddleware");
const { uploadCV } = require("../middleware/upload");

// POST /api/cv        — upload a PDF CV to Cloudinary
router.post(
  "/",
  authenticate,
  requireApprovedAlumni,
  uploadCV.single("cv"),
  cvController.uploadCV,
);

// GET /api/cv         — stream CV PDF back to browser (proxy, no direct Cloudinary access)
router.get("/", authenticate, requireApprovedAlumni, cvController.viewCV);

module.exports = router;
