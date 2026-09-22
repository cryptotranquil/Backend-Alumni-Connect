const userService = require("../services/userService");
const { checkPassword } = require("../utils/passwordPolicy");
const adminService = require("../services/adminService");
const auditLogService = require("../services/auditLog.service");
const notificationService = require("../services/notification.service");
const formatUser = require("../utils/formatUser");
const { releaseForDeletedUser } = require("../services/alumniRegistration");
const { serialize } = require("../utils/serialize");
const { generatePlainToken, hashToken } = require("../utils/tokenCrypto");
const { sendTransactionalEmail, frontendBaseUrl } = require("../services/email.service");

exports.deleteUser = async (req, res) => {
  const target = await userService.findById(req.params.id);
  if (!target) return res.status(404).json({ success: false, message: "User not found" });
  if (target.id === req.user.userId) return res.status(403).json({ success: false, message: "You cannot delete your own account." });

  if (target.role === "admin") {
    const allUsers = await userService.listUsers();
    if (allUsers.filter((u) => u.role === "admin").length <= 1) {
      return res.status(403).json({ success: false, message: "Cannot delete the last administrator." });
    }
  }
  await userService.deleteUser(target.id);
  // Free the alumni-roster entry so the real owner can register with that number.
  await releaseForDeletedUser(target);
  res.json({ success: true, message: "User deleted" });
};

exports.approveAlumni = async (req, res) => {
  const user = await userService.findById(req.params.id);
  if (!user || user.role !== "alumni") return res.status(404).json({ success: false, message: "Alumni user not found" });

  // Already active (for example approved automatically from the alumni roster):
  // nothing to change and no second notification.
  if (user.accountStatus === "active") return res.json(formatUser(user));

  await userService.updateUser(req.params.id, {
    accountStatus: "active",
    approvalSource: "manual",
    approvedBy: req.user.userId,
    approvedAt: new Date(),
  });
  const updated = await userService.findById(req.params.id);

  try { await notificationService.notifyAlumniApproved(updated); }
  catch (err) { console.warn("[approveAlumni] notification step failed:", err.message); }

  res.json(formatUser(updated));
};

exports.inviteAdmin = async (req, res) => {
  const { name, email, tempPassword } = req.body;
  if (!name?.trim() || !email?.trim() || !tempPassword) return res.status(400).json({ success: false, message: "Name, email, and temporary password are required." });
  const strength = checkPassword(tempPassword);
  if (!strength.ok) return res.status(400).json({ success: false, message: `Temporary password is too weak. ${strength.message}` });

  const normalized = email.toLowerCase().trim();
  if (await userService.findByEmail(normalized)) return res.status(400).json({ success: false, message: "That email is already registered." });

  const plainToken = generatePlainToken();
  const [firstname, ...rest] = name.trim().split(" ");
  const lastname = rest.join(" ");

  const user = await userService.createUser({
    firstname, lastname, email: normalized, password: tempPassword, role: "admin",
    accountStatus: "active", mustChangePassword: true,
    passwordResetTokenHash: hashToken(plainToken), passwordResetExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  const link = `${frontendBaseUrl()}/reset-password?token=${plainToken}`;
  const html = `<p>Hello ${name.trim()},</p><p>You have been added as an <strong>administrator</strong> on Alumni Connect.</p><p><strong>Temporary password:</strong> ${tempPassword}</p><p>You can sign in with this password; you will be prompted to choose a new password after login.</p><p><strong>Recommended:</strong> set your own password now using this secure link (valid 7 days):</p><p><a href="${link}">Set your password</a></p><p>If the button does not work, copy this URL:<br/>${link}</p>`;

  try {
    await sendTransactionalEmail({ to: user.email, subject: "Your Alumni Connect admin account", html });
  } catch (err) {
    console.error("[inviteAdmin] email error:", err);
    return res.status(500).json({ success: false, message: "Admin user was created but the invitation email could not be sent. Configure Brevo in .env or share credentials manually.", user: formatUser(user) });
  }
  res.status(201).json({ success: true, message: "Invitation email sent with temporary password and setup link.", user: formatUser(user) });
};

exports.getAllUsers = async (req, res) => {
  const users = await adminService.getAllUsersFiltered(req.query);
  res.json({ success: true, users: users.map(formatUser) });
};

exports.getPendingAlumni = async (req, res) => {
  const alumni = await adminService.getPendingAlumni();
  res.json({ success: true, alumni: alumni.map(formatUser) });
};

exports.getDashboardStats = async (req, res) => {
  try { res.json({ success: true, stats: await adminService.getDashboardStats() }); }
  catch (error) { console.error("Get dashboard stats error:", error); res.status(500).json({ success: false, message: "Server error" }); }
};

exports.getMentorshipAnalytics = async (req, res) => {
  try { res.json({ success: true, ...(await adminService.getMentorshipAnalytics()) }); }
  catch (error) { console.error("Get mentorship analytics error:", error); res.status(500).json({ success: false, message: "Server error" }); }
};

/** GET /admin/audit-logs?limit=50&cursor=<logId> — newest first. */
exports.getAuditLogs = async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const { logs, nextCursor } = await auditLogService.list({ limit, cursor: req.query.cursor });
    res.json({ success: true, logs: serialize(logs), nextCursor });
  } catch (error) {
    console.error("Get audit logs error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};