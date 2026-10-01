const { validationResult } = require("express-validator");
const userService = require("../services/userService");
const {
  generateToken,
  generateTwoFactorToken,
  verifyTwoFactorToken,
  tokenExpiry,
} = require("../utils/generateToken");
const twoFactorService = require("../services/twoFactor.service");
const {
  checkRegistrationNumber,
  decideAlumniRegistration,
  undoClaim,
} = require("../services/alumniRegistration");
const { maskEmail, CODE_TTL_MS } = require("../utils/twoFactorCode");
const formatUser = require("../utils/formatUser");
const { generatePlainToken, hashToken } = require("../utils/tokenCrypto");
const {
  sendTransactionalEmail,
  frontendBaseUrl,
} = require("../services/email.service");
const {
  TRUST_HOURS,
  generateDeviceToken,
  hashDeviceToken,
  expiryDate,
  prune,
} = require("../utils/trustedDevice");

// Per-account lockout, separate from the per-IP rate limiter in server.js:
// that limiter (100 requests / 15 min) is shared by every account behind one
// IP and does nothing to stop someone spraying guesses at a single account
// from many IPs.
const MAX_FAILED_LOGIN_ATTEMPTS =
  Number(process.env.MAX_FAILED_LOGIN_ATTEMPTS) || 10;
const ACCOUNT_LOCK_MINUTES = Number(process.env.ACCOUNT_LOCK_MINUTES) || 15;

function lockExpiry(user) {
  if (!user.lockUntil) return null;
  const expiry = user.lockUntil?.toDate
    ? user.lockUntil.toDate()
    : new Date(user.lockUntil);
  return expiry > new Date() ? expiry : null;
}

exports.bootstrap = async (_req, res) => {
  const userCount = await userService.countUsers();
  res.json({ allowFirstAdminRegister: userCount === 0 });
};

/** Issue a session token (10-minute clock starts now) and the response body for it. */
function sessionResponse(user, extra = {}) {
  const token = generateToken(user.id, user.tokenVersion || 0);
  return {
    success: true,
    user: formatUser(user),
    token,
    expiresAt: tokenExpiry(token),
    mustChangePassword: Boolean(user.mustChangePassword),
    ...extra,
  };
}

function twoFactorChallenge(user, sent) {
  return {
    success: true,
    twoFactorRequired: true,
    twoFactorToken: generateTwoFactorToken(user.id),
    destination: maskEmail(user.email),
    codeExpiresInSeconds: Math.round(CODE_TTL_MS / 1000),
    message: "We sent a 6-digit verification code to your email.",
    ...(sent.devCode ? { devCode: sent.devCode } : {}),
  };
}

function splitName(name) {
  const [firstname, ...rest] = String(name || "")
    .trim()
    .split(/\s+/);
  return { firstname, lastname: rest.join(" ") };
}

function inferredGraduationYear(registrationNumber) {
  const match = /^[A-Z]{2,4}\/(\d{2})\//i.exec(registrationNumber || "");
  return match ? String(2000 + Number(match[1]) + 4) : "";
}

exports.register = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res
      .status(400)
      .json({ success: false, message: errors.array()[0].msg });
  }

  const {
    name,
    email,
    password,
    role,
    phone,
    graduationYear,
    university,
    company,
    position,
    registrationNumber,
    department,
    program,
    campus,
  } = req.body;

  if (!["student", "alumni", "admin"].includes(role)) {
    return res.status(400).json({ success: false, message: "Invalid role." });
  }

  if (await userService.findByEmail(email)) {
    return res
      .status(409)
      .json({ success: false, message: "Email already registered" });
  }

  // Alumni are matched against the alumni roster by a normalised registration
  // number (BIT/24/BT/ME/009), so the duplicate check uses that form too.
  let regNumber = registrationNumber;
  if (role === "alumni") {
    const checked = checkRegistrationNumber(registrationNumber);
    if (!checked.ok) {
      return res.status(400).json({ success: false, message: checked.message });
    }
    regNumber = checked.registrationNumber;
  }
  if (regNumber && (await userService.findByRegistrationNumber(regNumber))) {
    return res.status(409).json({
      success: false,
      message: "That registration number is already registered",
    });
  }

  const userCount = await userService.countUsers();
  if (role === "admin" && userCount > 0) {
    return res.status(403).json({
      success: false,
      message:
        "Admin self-registration is only allowed when no users exist. Ask an administrator to invite you.",
    });
  }

  if (["student", "alumni"].includes(role) && !department) {
    return res
      .status(400)
      .json({ success: false, message: "Department is required." });
  }
  if (["student", "alumni"].includes(role) && !program) {
    return res
      .status(400)
      .json({ success: false, message: "Programme is required." });
  }
  if (role === "student" && !registrationNumber) {
    return res.status(400).json({
      success: false,
      message: "Registration number is required for students.",
    });
  }
  if (role === "alumni" && !graduationYear) {
    return res.status(400).json({
      success: false,
      message: "Graduation year is required for alumni.",
    });
  }

  const { firstname, lastname } = splitName(name);

  // Alumni: claim the roster entry first. Found and free -> active now;
  // otherwise the account is created pending for an admin to approve.
  const userId = userService.newUserId();
  const decision =
    role === "alumni"
      ? await decideAlumniRegistration({
          registrationNumber: regNumber,
          userId,
        })
      : null;

  if (
    decision?.reason === "already_claimed" &&
    (await userService.findByRegistrationNumber(regNumber))
  ) {
    // Someone else registered with this number a moment ago.
    return res.status(409).json({
      success: false,
      message: "That registration number is already registered",
    });
  }

  let user;
  try {
    user = await userService.createUser({
      id: userId,
      firstname,
      lastname,
      email,
      password,
      role,
      phone: phone || "",
      graduationYear:
        graduationYear || inferredGraduationYear(registrationNumber),
      university: university || "Exploits University",
      company: company || "",
      position: position || "",
      registrationNumber:
        role === "student" ? registrationNumber : regNumber || "",
      department: department || (role === "admin" ? "Administration" : ""),
      program: program || "",
      campus: campus || "",
      skills: [],
      interests: [],
      bio: "",
      profilePhoto: "",
      coverPhoto: "",
      accountStatus: decision ? decision.accountStatus : "active",
      approvalSource: decision?.approvalSource || undefined,
      mustChangePassword: false,
    });
  } catch (error) {
    // Do not leave the roster entry locked to an account that was never created.
    if (decision?.claimed) {
      await undoClaim({
        registrationNumber: decision.registrationNumber,
        userId,
      });
    }
    throw error;
  }

  if (user.accountStatus !== "active") {
    return res.status(201).json({
      success: true,
      user: formatUser(user),
      token: null,
      pendingApproval: true,
      message:
        "Your registration number was not found in the alumni list, so an administrator will review your account. You can sign in once it is approved.",
    });
  }

  return res
    .status(201)
    .json(sessionResponse(user, { pendingApproval: false }));
};

exports.login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res
      .status(400)
      .json({ success: false, message: errors.array()[0].msg });
  }

  const { email, password } = req.body;
  const user = await userService.findByEmail(email);

  if (user) {
    const lockedUntil = lockExpiry(user);
    if (lockedUntil) {
      return res.status(429).json({
        success: false,
        message:
          "Too many failed attempts on this account. Please try again later.",
        retryAfterSeconds: Math.ceil((lockedUntil - Date.now()) / 1000),
      });
    }
  }

  if (!user || !(await userService.matchPassword(password, user.password))) {
    if (user) {
      const attempts = (user.failedLoginAttempts || 0) + 1;
      const patch = { failedLoginAttempts: attempts };
      if (attempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
        patch.failedLoginAttempts = 0;
        patch.lockUntil = new Date(
          Date.now() + ACCOUNT_LOCK_MINUTES * 60 * 1000,
        );
      }
      await userService.updateUser(user.id, patch);
    }
    return res
      .status(401)
      .json({ success: false, message: "Invalid email or password" });
  }
  if (user.accountStatus === "disabled") {
    return res
      .status(403)
      .json({ success: false, message: "This account has been disabled." });
  }

  if (user.failedLoginAttempts || user.lockUntil) {
    await userService.updateUser(user.id, {
      failedLoginAttempts: 0,
      lockUntil: null,
    });
  }

  const trustedToken = req.body.trustedDeviceToken;
  const storedDevices = Array.isArray(user.trustedDevices)
    ? user.trustedDevices
    : [];
  const activeDevices = prune(storedDevices);
  const trustHash = trustedToken ? hashDeviceToken(trustedToken) : null;
  const isTrusted =
    !!trustHash && activeDevices.some((d) => d.tokenHash === trustHash);

  if (activeDevices.length !== storedDevices.length) {
    await userService.updateUser(user.id, { trustedDevices: activeDevices });
  }

  if (!twoFactorService.isEnabled() || user.role === "admin" || isTrusted) {
    return res.json(sessionResponse(user));
  }

  const sent = await twoFactorService.sendCode(user);
  if (!sent.ok) {
    return res.status(503).json({
      success: false,
      message:
        "We could not send your verification code right now. Please try again shortly.",
    });
  }
  res.json(twoFactorChallenge(user, sent));
};

function invalidTwoFactorSession(res) {
  return res.status(401).json({
    success: false,
    message: "Your verification session has expired. Please sign in again.",
  });
}

exports.verifyTwoFactor = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res
      .status(400)
      .json({ success: false, message: errors.array()[0].msg });
  }

  let decoded;
  try {
    decoded = verifyTwoFactorToken(req.body.twoFactorToken);
  } catch (_error) {
    return invalidTwoFactorSession(res);
  }

  const user = await userService.findById(decoded.userId);
  if (!user || user.accountStatus === "disabled") {
    return invalidTwoFactorSession(res);
  }

  const result = await twoFactorService.verifyCode(user.id, req.body.code);
  switch (result.status) {
    case "ok": {
      // Correct code: mint a trusted-device token valid for TRUST_HOURS.
      const deviceToken = generateDeviceToken();
      const entry = {
        tokenHash: hashDeviceToken(deviceToken),
        expiresAt: expiryDate(),
        createdAt: new Date(),
        userAgent: String(req.header("User-Agent") || "").slice(0, 200),
      };

      const existing = prune(user.trustedDevices || []).slice(-9);
      await userService.updateUser(user.id, {
        trustedDevices: [...existing, entry],
      });

      return res.json(
        sessionResponse(user, {
          trustedDeviceToken: deviceToken,
          trustedDeviceExpiresAt: entry.expiresAt.toISOString(),
          trustedDeviceHours: TRUST_HOURS,
        }),
      );
    }
    case "invalid":
      return res.status(401).json({
        success: false,
        message: `Incorrect code. ${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? "" : "s"} left.`,
        attemptsLeft: result.attemptsLeft,
      });
    case "expired":
      return res.status(401).json({
        success: false,
        message: "That code has expired. Request a new one.",
      });
    case "locked":
      return res.status(429).json({
        success: false,
        message: "Too many incorrect codes. Please sign in again.",
      });
    default:
      return res.status(401).json({
        success: false,
        message: "No active verification code. Request a new one.",
      });
  }
};

exports.resendTwoFactor = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res
      .status(400)
      .json({ success: false, message: errors.array()[0].msg });
  }

  let decoded;
  try {
    decoded = verifyTwoFactorToken(req.body.twoFactorToken);
  } catch (_error) {
    return invalidTwoFactorSession(res);
  }

  const user = await userService.findById(decoded.userId);
  if (!user || user.accountStatus === "disabled") {
    return invalidTwoFactorSession(res);
  }

  const sent = await twoFactorService.sendCode(user, { enforceCooldown: true });
  if (!sent.ok && sent.reason === "cooldown") {
    return res.status(429).json({
      success: false,
      message: `Please wait ${sent.retryAfterSeconds}s before requesting another code.`,
      retryAfterSeconds: sent.retryAfterSeconds,
    });
  }
  if (!sent.ok) {
    return res.status(503).json({
      success: false,
      message:
        "We could not send your verification code right now. Please try again shortly.",
    });
  }
  res.json(twoFactorChallenge(user, sent));
};

exports.forgotPassword = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res
      .status(400)
      .json({ success: false, message: errors.array()[0].msg });
  }

  const { email } = req.body;
  const user = await userService.findByEmail(email);
  const generic =
    "If an account exists for that email, you will receive reset instructions shortly.";
  if (!user) return res.json({ success: true, message: generic });

  const plainToken = generatePlainToken();
  await userService.updateUser(user.id, {
    passwordResetTokenHash: hashToken(plainToken),
    passwordResetExpires: new Date(Date.now() + 60 * 60 * 1000),
  });

  const link = `${frontendBaseUrl()}/reset-password?token=${plainToken}`;
  const html = `<p>Hello ${user.firstname || "there"},</p><p>We received a request to reset your Alumni Connect password.</p><p><a href="${link}">Reset your password</a></p><p>This link expires in one hour. If you did not request this, you can ignore this email.</p>`;
  try {
    await sendTransactionalEmail({
      to: user.email,
      subject: "Reset your Alumni Connect password",
      html,
    });
  } catch (error) {
    console.error("[forgotPassword] email error:", error);
  }

  const responseBody = { success: true, message: generic };
  if (process.env.NODE_ENV !== "production") responseBody.devToken = plainToken;
  res.json(responseBody);
};

exports.resetPasswordWithToken = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res
      .status(400)
      .json({ success: false, message: errors.array()[0].msg });
  }

  const { token, newPassword } = req.body;
  const user = await userService.findByResetTokenHash(hashToken(token));
  if (!user) {
    return res.status(400).json({
      success: false,
      message: "Invalid or expired reset link. Request a new one from login.",
    });
  }

  await userService.updateUser(user.id, {
    password: newPassword,
    passwordResetTokenHash: null,
    passwordResetExpires: null,
    mustChangePassword: false,
    // Invalidate any session token issued before this reset.
    tokenVersion: (user.tokenVersion || 0) + 1,
  });
  res.json({
    success: true,
    message: "Password updated. You can sign in with your new password.",
  });
};

/** POST /api/logout — bumps tokenVersion so every outstanding token for this
 *  user (this device and any other) stops working immediately. */
exports.logout = async (req, res) => {
  const user = await userService.findById(req.user.userId);
  if (user) {
    await userService.updateUser(user.id, {
      tokenVersion: (user.tokenVersion || 0) + 1,
    });
  }
  res.json({ success: true, message: "Logged out." });
};
