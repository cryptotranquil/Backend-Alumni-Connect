const { serialize } = require("./serialize");

/**
 * Normalize a Firestore user/profile document to the exact User contract used
 * by the React frontend. Sensitive and backend-only fields are never returned.
 */
const formatUser = (user) => {
  if (!user) return null;

  const u = serialize({ ...user });
  u._id = u.id || u._id;
  u.name =
    u.name || `${u.firstname || ""} ${u.lastname || ""}`.trim() || "Member";
  u.position = u.position || u.jobTitle || "";
  u.program = u.program || u.programme || "";
  u.isApproved =
    typeof u.accountStatus === "string"
      ? u.accountStatus === "active"
      : Boolean(u.isApproved);
  u.mustChangePassword = Boolean(u.mustChangePassword);

  delete u.id;
  delete u.firstname;
  delete u.lastname;
  delete u.password;
  delete u.passwordResetTokenHash;
  delete u.passwordResetExpires;
  delete u.accountStatus;
  delete u.twoFactorCodeHash;
  delete u.twoFactorExpires;
  delete u.twoFactorAttempts;
  delete u.twoFactorSentAt;
  delete u.tokenVersion;
  delete u.failedLoginAttempts;
  delete u.lockUntil;

  return u;
};

module.exports = formatUser;
