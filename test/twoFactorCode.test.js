const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = "unit-test-secret";
const {
  MAX_ATTEMPTS,
  generateCode,
  hashCode,
  evaluateAttempt,
  maskEmail,
} = require("../src/utils/twoFactorCode");

const future = () => new Date(Date.now() + 60_000);

function record(code, overrides = {}) {
  return {
    twoFactorCodeHash: hashCode("user-1", code),
    twoFactorExpires: future(),
    twoFactorAttempts: 0,
    ...overrides,
  };
}

test("generateCode returns 6 digits including leading zeros", () => {
  for (let i = 0; i < 200; i += 1) assert.match(generateCode(), /^\d{6}$/);
});

test("hash depends on user and code, and is not the plain code", () => {
  assert.notEqual(hashCode("user-1", "123456"), hashCode("user-2", "123456"));
  assert.notEqual(hashCode("user-1", "123456"), hashCode("user-1", "654321"));
  assert.ok(!hashCode("user-1", "123456").includes("123456"));
});

test("correct code is accepted", () => {
  assert.equal(evaluateAttempt(record("123456"), "user-1", "123456").status, "ok");
});

test("wrong code counts an attempt and locks after the limit", () => {
  let rec = record("123456");
  for (let i = 1; i < MAX_ATTEMPTS; i += 1) {
    const result = evaluateAttempt(rec, "user-1", "000000");
    assert.equal(result.status, "invalid");
    assert.equal(result.attempts, i);
    rec = { ...rec, twoFactorAttempts: result.attempts };
  }
  assert.equal(evaluateAttempt(rec, "user-1", "000000").status, "locked");
  // Once locked, even the right code is refused.
  const locked = { ...rec, twoFactorAttempts: MAX_ATTEMPTS };
  assert.equal(evaluateAttempt(locked, "user-1", "123456").status, "locked");
});

test("expired or missing codes are rejected", () => {
  const expired = record("123456", { twoFactorExpires: new Date(Date.now() - 1) });
  assert.equal(evaluateAttempt(expired, "user-1", "123456").status, "expired");
  assert.equal(evaluateAttempt({}, "user-1", "123456").status, "none");
  assert.equal(evaluateAttempt(null, "user-1", "123456").status, "none");
});

test("Firestore timestamps are understood", () => {
  const rec = record("123456", { twoFactorExpires: { toDate: future } });
  assert.equal(evaluateAttempt(rec, "user-1", "123456").status, "ok");
});

test("maskEmail hides most of the address", () => {
  assert.equal(maskEmail("john.doe@gmail.com"), "jo••••••@gmail.com");
  assert.match(maskEmail("ab@x.io"), /@x\.io$/);
});
