const express = require("express");
const controller = require("../controllers/postController");
const {
  authenticate,
  requireApprovedAlumni,
} = require("../middleware/authMiddleware");

const router = express.Router();
router.use(authenticate, requireApprovedAlumni);
router.get("/", controller.list);
router.post("/", controller.create);
router.post("/:id/like", controller.toggleLike);
router.post("/:id/comments", controller.comment);
router.put("/:id", controller.update);
router.delete("/:id", controller.remove);

module.exports = router;
