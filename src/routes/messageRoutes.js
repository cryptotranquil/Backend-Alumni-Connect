const express = require("express");
const messageController = require("../controllers/messageController");
const {
  authenticate,
  requireApprovedAlumni,
} = require("../middleware/authMiddleware");
const { sendMessageValidation, validate } = require("../middleware/validation");

const router = express.Router();

router.use(authenticate, requireApprovedAlumni);

router.get("/conversations", messageController.getConversations);
router.get("/thread/:userId", messageController.getThread);
router.post(
  "/send",
  sendMessageValidation,
  validate,
  messageController.sendMessage,
);

// Aliases matching the frontend's messageApi.ts, which calls
// GET /messages/:userId and POST /messages directly (no /thread or /send
// segment). Kept as separate routes rather than renaming the originals,
// in case anything else already depends on /thread and /send.
router.get("/:userId", messageController.getThread);
router.post("/", sendMessageValidation, validate, messageController.sendMessage);

module.exports = router;
