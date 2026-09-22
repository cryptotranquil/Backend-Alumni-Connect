const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "unit-test-secret";
delete process.env.SESSION_MINUTES;
const {
  generateToken,
  generateTwoFactorToken,
  verifySessionToken,
  verifyTwoFactorToken,
  tokenExpiry,
} = require("../src/utils/generateToken");

test("session tokens last 10 minutes by default", () => {
  const token = generateToken("user-1");
  const { iat, exp } = jwt.decode(token);
  assert.equal(exp - iat, 600);
  assert.equal(verifySessionToken(token).userId, "user-1");
  assert.equal(new Date(tokenExpiry(token)).getTime(), exp * 1000);
});

test("SESSION_MINUTES overrides the length, bad values fall back to 10", () => {
  process.env.SESSION_MINUTES = "30";
  const { iat, exp } = jwt.decode(generateToken("u"));
  assert.equal(exp - iat, 1800);
  process.env.SESSION_MINUTES = "abc";
  const again = jwt.decode(generateToken("u"));
  assert.equal(again.exp - again.iat, 600);
  delete process.env.SESSION_MINUTES;
});

test("a 2FA token can never be used as a session token", () => {
  const twoFactor = generateTwoFactorToken("user-1");
  assert.throws(() => verifySessionToken(twoFactor), { name: "JsonWebTokenError" });
  assert.equal(verifyTwoFactorToken(twoFactor).userId, "user-1");
});

test("a session token can never be used as a 2FA token", () => {
  assert.throws(() => verifyTwoFactorToken(generateToken("user-1")), {
    name: "JsonWebTokenError",
  });
});

test("expired tokens are rejected", () => {
  const expired = jwt.sign({ userId: "u" }, process.env.JWT_SECRET, { expiresIn: -1 });
  assert.throws(() => verifySessionToken(expired), { name: "TokenExpiredError" });
});
