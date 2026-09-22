const crypto = require("crypto");

const CODE_LENGTH = 6;
const CODE_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_ATTEMPTS = 5;

function generateCode() {
  return String(crypto.randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
}

/** Keyed hash so a leaked database row cannot be brute-forced offline. */
function hashCode(userId, code) {
  return crypto
    .createHmac("sha256", process.env.JWT_SECRET || "")
    .update(`${userId}:${code}`)
    .digest("hex");
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toDate === "function") return value.toDate().getTime();
  return new Date(value).getTime() || 0;
}

/**
 * Pure decision function. `record` holds the stored twoFactor* fields.
 * Returns { status: "ok" | "invalid" | "expired" | "locked" | "none", attempts }.
 */
function evaluateAttempt(record, userId, code, now = Date.now()) {
  if (!record || !record.twoFactorCodeHash) return { status: "none", attempts: 0 };
  const attempts = Number(record.twoFactorAttempts) || 0;
  if (toMillis(record.twoFactorExpires) <= now) return { status: "expired", attempts };
  if (attempts >= MAX_ATTEMPTS) return { status: "locked", attempts };
  if (safeEqual(hashCode(userId, String(code || "")), record.twoFactorCodeHash)) {
    return { status: "ok", attempts };
  }
  const next = attempts + 1;
  return { status: next >= MAX_ATTEMPTS ? "locked" : "invalid", attempts: next };
}

function maskEmail(email) {
  const [local = "", domain = ""] = String(email || "").split("@");
  if (!domain) return "your email";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"•".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

module.exports = {
  CODE_LENGTH,
  CODE_TTL_MS,
  RESEND_COOLDOWN_MS,
  MAX_ATTEMPTS,
  generateCode,
  hashCode,
  evaluateAttempt,
  maskEmail,
  toMillis,
};
