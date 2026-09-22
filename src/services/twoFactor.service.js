const db = require("../config/firestore");
const userService = require("./userService");
const { sendTransactionalEmail } = require("./email.service");
const {
  CODE_TTL_MS,
  RESEND_COOLDOWN_MS,
  MAX_ATTEMPTS,
  generateCode,
  hashCode,
  evaluateAttempt,
  toMillis,
} = require("../utils/twoFactorCode");

const usersRef = db.collection("users");

function isEnabled() {
  return String(process.env.TWO_FACTOR_ENABLED || "true").toLowerCase() !== "false";
}

/** Codes are only echoed back to the client in explicit local/test environments. */
function exposeCodeInResponse() {
  return ["development", "test"].includes(process.env.NODE_ENV);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[ch]);
}

/**
 * Generate a fresh code, store only its keyed hash and email it to the user.
 * Returns { ok: true, devCode? } | { ok: false, reason: "cooldown" | "delivery", retryAfterSeconds? }
 */
async function sendCode(user, { enforceCooldown = false } = {}) {
  const now = Date.now();
  if (enforceCooldown) {
    const elapsed = now - toMillis(user.twoFactorSentAt);
    if (elapsed < RESEND_COOLDOWN_MS) {
      return {
        ok: false,
        reason: "cooldown",
        retryAfterSeconds: Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000),
      };
    }
  }

  const code = generateCode();
  await userService.updateUser(user.id, {
    twoFactorCodeHash: hashCode(user.id, code),
    twoFactorExpires: new Date(now + CODE_TTL_MS),
    twoFactorAttempts: 0,
    twoFactorSentAt: new Date(now),
  });

  const minutes = Math.round(CODE_TTL_MS / 60000);
  const html =
    `<p>Hello ${escapeHtml(user.firstname || "there")},</p>` +
    `<p>Your Alumni Connect verification code is:</p>` +
    `<p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p>` +
    `<p>It expires in ${minutes} minutes. If you did not try to sign in, change your password.</p>`;

  try {
    const result = await sendTransactionalEmail({
      to: user.email,
      subject: "Your Alumni Connect verification code",
      html,
    });
    if (result.skipped) {
      if (exposeCodeInResponse()) {
        console.warn(`[2FA] Brevo not configured — code for ${user.email}: ${code}`);
        return { ok: true, devCode: code };
      }
      await clearCode(user.id);
      return { ok: false, reason: "delivery" };
    }
  } catch (error) {
    console.error("[2FA] email error:", error.message);
    await clearCode(user.id);
    return { ok: false, reason: "delivery" };
  }
  return { ok: true, ...(exposeCodeInResponse() ? { devCode: code } : {}) };
}

function clearCode(userId) {
  return userService.updateUser(userId, {
    twoFactorCodeHash: null,
    twoFactorExpires: null,
    twoFactorAttempts: 0,
  });
}

/**
 * Check a submitted code inside a transaction so parallel guesses cannot
 * exceed the attempt limit. Returns { status, attemptsLeft }.
 */
async function verifyCode(userId, code) {
  return db.runTransaction(async (tx) => {
    const ref = usersRef.doc(userId);
    const snap = await tx.get(ref);
    if (!snap.exists) return { status: "none", attemptsLeft: 0 };

    const result = evaluateAttempt(snap.data(), userId, code);
    const cleared = { twoFactorCodeHash: null, twoFactorExpires: null, twoFactorAttempts: 0 };

    if (result.status === "ok" || result.status === "expired" || result.status === "locked") {
      tx.update(ref, cleared);
    } else if (result.status === "invalid") {
      tx.update(ref, { twoFactorAttempts: result.attempts });
    }
    return {
      status: result.status,
      attemptsLeft: Math.max(0, MAX_ATTEMPTS - result.attempts),
    };
  });
}

module.exports = { isEnabled, sendCode, verifyCode, clearCode };
