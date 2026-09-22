const express = require("express");
const controller = require("../controllers/mentorController");
const {
  authenticate,
  requireApprovedAlumni,
} = require("../middleware/authMiddleware");

const router = express.Router();
router.use(authenticate, requireApprovedAlumni);
router.get("/matches", controller.getMentorMatches);
router.get("/mentees", controller.getMenteeMatches);
router.get("/state", controller.getState);
router.post("/request", controller.requestMentorship);
router.post("/offer", controller.offerMentorship);

module.exports = router;
