const express = require("express");
const router = express.Router();
const { authenticate: protect } = require("../middleware/authMiddleware");
const {
  // Existing
  requestConnection,
  listForStudent,
  listForAlumni,
  accept,
  reject,
  cancel,
  // New matching algorithm functions
  createMentorshipRequest,
  getMatchingSuggestions,
  getMentorshipRequests,
  respondToMentorshipRequest,
  getActiveMentorships,
  completeMentorship,
  getConnectionStatus,
} = require("../controllers/connectionController");

// All routes require authentication - this is correct
router.use(protect);

// ========== EXISTING ROUTES ==========
router.post("/request", requestConnection);
router.get("/student", listForStudent);
router.get("/alumni", listForAlumni);
router.get("/status/:targetId", getConnectionStatus);
router.put("/:id/accept", accept);
router.put("/:id/reject", reject);
router.delete("/:id/cancel", cancel);

// Frontend calls DELETE /connections/:id for BOTH declining (alumni) and
// cancelling (student) a pending request — the two controllers are already
// mutually exclusive by role, so route to whichever applies to this user.
router.delete("/:id", (req, res, next) => {
  if (req.user?.role === "alumni") return reject(req, res, next);
  if (req.user?.role === "student") return cancel(req, res, next);
  return res.status(403).json({ success: false, message: "Not authorized" });
});

// ========== NEW ROUTES FOR MATCHING ALGORITHM ==========
// Student routes
router.post("/mentorship/request", createMentorshipRequest);
router.get("/mentorship/suggestions", getMatchingSuggestions);

// Alumni routes
router.get("/mentorship/requests", getMentorshipRequests);
router.put("/mentorship/:id/respond", respondToMentorshipRequest);

// Common routes
router.get("/mentorship/active", getActiveMentorships);
router.put("/mentorship/:id/complete", completeMentorship);

module.exports = router;
