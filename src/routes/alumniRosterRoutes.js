const express = require("express");
const controller = require("../controllers/alumniRosterController");
const { rosterUpload } = require("../middleware/rosterUpload");
const { validate } = require("../middleware/validation");
const { createEntryValidation, updateEntryValidation, listValidation } = require("../middleware/rosterValidation");
const auditLog = require("../middleware/auditLog");

// Mounted from adminRoutes.js, which already requires an authenticated admin.
const router = express.Router();

// A dry-run preview changes nothing, so it is not written to the audit log.
const auditRealImport = (req, res, next) =>
  String(req.query.dryRun).toLowerCase() === "true"
    ? next()
    : auditLog("admin.importAlumniRoster")(req, res, next);

// Fixed paths first, so they are not mistaken for an :id.
router.get("/template", controller.template);
router.get("/stats", controller.stats);
router.get("/imports", controller.history);
router.post("/import", rosterUpload, auditRealImport, controller.importRoster);
router.post("/recheck-pending", auditLog("admin.recheckPendingAlumni"), controller.recheck);

router.get("/", listValidation, validate, controller.list);
router.post("/", createEntryValidation, validate, auditLog("admin.createRosterEntry"), controller.create);
router.get("/:id", controller.getOne);
router.put("/:id", updateEntryValidation, validate, auditLog("admin.updateRosterEntry"), controller.update);
router.delete("/:id", auditLog("admin.deleteRosterEntry"), controller.remove);
router.post("/:id/release", auditLog("admin.releaseRosterEntry"), controller.release);

module.exports = router;
