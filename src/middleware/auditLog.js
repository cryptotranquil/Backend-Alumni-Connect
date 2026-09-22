const auditLogService = require("../services/auditLog.service");

/** Records `action` to the audit log once the route handler after it
 *  succeeds (2xx). Mount it before the controller on any admin-mutating
 *  route: `router.delete("/users/:id", auditLog("admin.deleteUser"), adminController.deleteUser)`.
 *  Logging happens after the response is sent and never blocks or fails it. */
const auditLog = (action) => (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      auditLogService
        .record({
          actorId: req.user?.userId,
          actorEmail: req.user?.email,
          action,
          targetId: req.params?.id,
          method: req.method,
          path: req.originalUrl,
          ip: req.ip,
        })
        .catch((error) => console.error(`[auditLog] failed to record ${action}:`, error.message));
    }
    return originalJson(body);
  };
  next();
};

module.exports = auditLog;
