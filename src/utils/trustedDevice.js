const crypto = require("crypto");

const TRUST_HOURS = Math.max(
  1,
  Number(process.env.TWO_FACTOR_TRUST_HOURS) || 24,
);
const TRUST_TTL_MS = TRUST_HOURS * 60 * 60 * 1000;

function generateDeviceToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashDeviceToken(token) {
  return crypto
    .createHmac("sha256", process.env.JWT_SECRET || "")
    .update(String(token))
    .digest("hex");
}

function expiryDate() {
  return new Date(Date.now() + TRUST_TTL_MS);
}

function prune(list) {
  const now = Date.now();
  return (Array.isArray(list) ? list : []).filter((d) => {
    const t = d?.expiresAt?.toDate
      ? d.expiresAt.toDate().getTime()
      : new Date(d?.expiresAt).getTime();
    return Number.isFinite(t) && t > now;
  });
}

module.exports = {
  TRUST_HOURS,
  TRUST_TTL_MS,
  generateDeviceToken,
  hashDeviceToken,
  expiryDate,
  prune,
};
