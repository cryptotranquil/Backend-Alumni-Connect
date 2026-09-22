const express = require("express");
const eventController = require("../controllers/eventController");
const {
  authenticate,
  authorize,
  requireApprovedAlumni,
} = require("../middleware/authMiddleware");
const { createEventValidation, validate } = require("../middleware/validation");

const router = express.Router();

// The in-process scheduler authenticates with CRON_SECRET rather than a user
// JWT. Administrators can also trigger this endpoint manually with a JWT.
router.post(
  "/reminders",
  (req, res, next) => {
    if (
      process.env.CRON_SECRET &&
      req.headers["x-cron-secret"] === process.env.CRON_SECRET
    ) {
      return next();
    }
    return authenticate(req, res, () => authorize("admin")(req, res, next));
  },
  eventController.sendEventReminders,
);

router.use(authenticate, requireApprovedAlumni);
router.get("/", eventController.listEvents);
router.get("/mine", eventController.myEvents);
router.post(
  "/",
  authorize("admin"),
  createEventValidation,
  validate,
  eventController.createEvent,
);
router.post("/:id/join", eventController.joinEvent);
router.post("/:id/rsvp", eventController.toggleRsvp);
router.get("/:id/rsvp-status", eventController.rsvpStatus);
router.get(
  "/:id/participants",
  authorize("admin"),
  eventController.getParticipants,
);
router.delete("/:id", authorize("admin"), eventController.deleteEvent);

module.exports = router;
