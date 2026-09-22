const express = require("express");
const userController = require("../controllers/userController");
const profileController = require("../controllers/profileController");
const {
  authenticate,
  authorize,
  requireApprovedAlumni,
} = require("../middleware/authMiddleware");
const {
  uploadPhoto,
  uploadProfileMedia,
} = require("../middleware/upload");
const {
  updateProfileValidation,
  changePasswordValidation,
  validate,
} = require("../middleware/validation");

const router = express.Router();
// This router is mounted at /api, so scope shared auth to its own prefixes;
// an unscoped router.use() would accidentally protect /departments and cron.
router.use(["/users", "/profile"], authenticate, requireApprovedAlumni);

router.get("/users/peer/:id", userController.getPublicPeer);
router.get("/users", authorize("admin"), userController.listUsers);

// Current user's profile resources.
router.get("/profile/stats", userController.getProfileStats);
router.get("/profile/experiences", profileController.getExperiences);
router.get("/profile/achievements", profileController.getAchievements);
router.get("/profile/education", profileController.getEducation);
router.get("/profile/tagged-posts", profileController.getTaggedPosts);
router.get("/profile/activity", profileController.getActivity);
router.get("/profile/suggestions", profileController.getSuggestions);
router.get("/profile/connections", profileController.getConnections);
router.get("/profile/followers", profileController.getFollowers);
router.get("/profile/following", profileController.getFollowing);
router.get("/profile/following-ids", profileController.getFollowingIds);
router.get("/profile/recommendations", profileController.getRecommendations);
router.get(
  "/profile/skill-endorsements",
  profileController.getSkillEndorsements,
);
router.get("/profile", userController.getProfile);
router.put(
  "/profile/update",
  updateProfileValidation,
  validate,
  userController.updateProfile,
);
router.put(
  "/profile/password",
  changePasswordValidation,
  validate,
  userController.changePassword,
);
router.post(
  "/profile/photo",
  uploadPhoto.single("photo"),
  userController.uploadPhoto,
);
router.post(
  "/profile/media",
  uploadProfileMedia.fields([
    { name: "photo", maxCount: 1 },
    { name: "cover", maxCount: 1 },
  ]),
  userController.uploadMedia,
);

// Public/member profile resources. Keep GET /users/:id last.
router.get("/users/:id/experiences", profileController.getExperiences);
router.get("/users/:id/achievements", profileController.getAchievements);
router.get("/users/:id/education", profileController.getEducation);
router.get("/users/:id/tagged-posts", profileController.getTaggedPosts);
router.get("/users/:id/activity", profileController.getActivity);
router.get("/users/:id/suggestions", profileController.getSuggestions);
router.get("/users/:id/connections", profileController.getConnections);
router.get("/users/:id/followers", profileController.getFollowers);
router.get("/users/:id/follow-status", profileController.getFollowStatus);
router.post("/users/:id/follow", profileController.toggleFollow);
router.get("/users/:id/recommendations", profileController.getRecommendations);
router.post("/users/:id/recommendations", profileController.addRecommendation);
router.get(
  "/users/:id/skill-endorsements",
  profileController.getSkillEndorsements,
);
router.post("/users/:id/endorse", profileController.endorseSkill);
router.get("/users/:id", profileController.getPublicProfile);

module.exports = router;
