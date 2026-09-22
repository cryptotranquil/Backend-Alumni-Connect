const express = require("express");
const controller = require("../controllers/groupController");
const {
  authenticate,
  requireApprovedAlumni,
} = require("../middleware/authMiddleware");

const router = express.Router();
router.use(authenticate, requireApprovedAlumni);
router.get("/", controller.list);
router.get("/:id/membership", controller.membership);
router.post("/:id/toggle", controller.toggle);
router.get("/:id/posts", controller.posts);
router.get("/:id/members", controller.members);

module.exports = router;
