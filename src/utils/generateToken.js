const jwt = require("jsonwebtoken");

const DEFAULT_SESSION_MINUTES = 10;
const TWO_FACTOR_TOKEN_SECONDS = 5 * 60;

function secret() {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not set");
  }
  return process.env.JWT_SECRET;
}

/** Session length in seconds. Fixed 10 minutes unless SESSION_MINUTES says otherwise. */
function sessionSeconds() {
  const minutes = Number(process.env.SESSION_MINUTES);
  const safe =
    Number.isFinite(minutes) && minutes >= 1 && minutes <= 24 * 60
      ? minutes
      : DEFAULT_SESSION_MINUTES;
  return Math.round(safe * 60);
}

/**
 * Session token. The clock starts when it is issued and is never extended.
 * `tokenVersion` is embedded as `v` and compared against the user's stored
 * tokenVersion on every request, so bumping the stored value (logout,
 * password change/reset) revokes every token issued before the bump.
 */
const generateToken = (userId, tokenVersion = 0) =>
  jwt.sign({ userId: String(userId), v: tokenVersion || 0 }, secret(), {
    expiresIn: sessionSeconds(),
  });

/** Short-lived token proving the password step passed; only valid for the 2FA endpoints. */
const generateTwoFactorToken = (userId) =>
  jwt.sign({ userId: String(userId), purpose: "2fa" }, secret(), {
    expiresIn: TWO_FACTOR_TOKEN_SECONDS,
  });

function invalidToken() {
  const error = new Error("Invalid token");
  error.name = "JsonWebTokenError";
  return error;
}

/** Verify a normal session token. Rejects 2FA tokens so they cannot skip the second step. */
function verifySessionToken(token) {
  const decoded = jwt.verify(token, secret());
  if (decoded.purpose) throw invalidToken();
  return decoded;
}

function verifyTwoFactorToken(token) {
  const decoded = jwt.verify(token, secret());
  if (decoded.purpose !== "2fa") throw invalidToken();
  return decoded;
}

/** ISO timestamp at which the given token stops working. */
function tokenExpiry(token) {
  const decoded = jwt.decode(token);
  return decoded?.exp ? new Date(decoded.exp * 1000).toISOString() : null;
}

module.exports = generateToken;
module.exports.generateToken = generateToken;
module.exports.generateTwoFactorToken = generateTwoFactorToken;
module.exports.verifySessionToken = verifySessionToken;
module.exports.verifyTwoFactorToken = verifyTwoFactorToken;
module.exports.tokenExpiry = tokenExpiry;
module.exports.sessionSeconds = sessionSeconds;
