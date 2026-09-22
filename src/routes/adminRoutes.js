const express = require("express");
const adminController = require("../controllers/adminController");
const departmentController = require("../controllers/departmentController");
const jobController = require("../controllers/jobController");
const eventController = require("../controllers/eventController");
const { authenticate, authorize } = require("../middleware/authMiddleware");
const auditLog = require("../middleware/auditLog");

const router = express.Router();

router.use(authenticate, authorize("admin"));

// ========== USER MANAGEMENT ==========
router.delete("/users/:id", auditLog("admin.deleteUser"), adminController.deleteUser);
router.post("/invite-admin", auditLog("admin.inviteAdmin"), adminController.inviteAdmin);
router.put("/approve-alumni/:id", auditLog("admin.approveAlumni"), adminController.approveAlumni);
router.get("/users", adminController.getAllUsers); // NEW
router.get("/users/pending-alumni", adminController.getPendingAlumni); // NEW

// ========== DASHBOARD STATISTICS (for Recharts) ==========
router.get("/dashboard/stats", adminController.getDashboardStats); // NEW
router.get(
  "/dashboard/mentorship-analytics",
  adminController.getMentorshipAnalytics,
); // NEW

// ========== AUDIT LOG ==========
router.get("/audit-logs", adminController.getAuditLogs);

// ========== DEPARTMENTS ==========
router.get("/departments/all", departmentController.listAll);
router.get("/departments/stats", departmentController.stats);
router.post("/departments", auditLog("admin.createDepartment"), departmentController.create);
router.put("/departments/:id", auditLog("admin.updateDepartment"), departmentController.update);
router.delete("/departments/:id", auditLog("admin.deleteDepartment"), departmentController.remove);

// ========== JOB MODERATION ==========
router.put("/approve-job/:id", auditLog("admin.approveJob"), jobController.approveJob);

// ========== EVENT MANAGEMENT ==========
router.delete("/events/:id", auditLog("admin.deleteEvent"), eventController.deleteEvent);

// ========== ALUMNI ROSTER ==========
router.use("/alumni-roster", require("./alumniRosterRoutes"));

module.exports = router;