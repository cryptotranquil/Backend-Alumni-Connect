const test = require("node:test");
const assert = require("node:assert/strict");
const formatUser = require("../src/utils/formatUser");
const { serialize } = require("../src/utils/serialize");

test("formatUser matches the frontend User contract and strips secrets", () => {
  const date = new Date("2026-01-02T03:04:05.000Z");
  const output = formatUser({
    id: "user-1",
    firstname: "Ada",
    lastname: "Lovelace",
    email: "ada@example.com",
    password: "secret",
    passwordResetTokenHash: "hash",
    twoFactorCodeHash: "code-hash",
    twoFactorExpires: "soon",
    twoFactorAttempts: 2,
    twoFactorSentAt: "now",
    accountStatus: "active",
    jobTitle: "Engineer",
    programme: "BIT",
    tokenVersion: 3,
    failedLoginAttempts: 2,
    lockUntil: "soon",
    createdAt: { toDate: () => date },
  });

  assert.equal(output._id, "user-1");
  assert.equal(output.name, "Ada Lovelace");
  assert.equal(output.position, "Engineer");
  assert.equal(output.program, "BIT");
  assert.equal(output.isApproved, true);
  assert.equal(output.createdAt, date.toISOString());
  assert.equal(output.password, undefined);
  assert.equal(output.passwordResetTokenHash, undefined);
  assert.equal(output.twoFactorCodeHash, undefined);
  assert.equal(output.twoFactorExpires, undefined);
  assert.equal(output.twoFactorAttempts, undefined);
  assert.equal(output.twoFactorSentAt, undefined);
  assert.equal(output.accountStatus, undefined);
  assert.equal(output.tokenVersion, undefined);
  assert.equal(output.failedLoginAttempts, undefined);
  assert.equal(output.lockUntil, undefined);
});

test("serialize converts nested Firestore timestamps", () => {
  const date = new Date("2026-06-01T00:00:00.000Z");
  assert.deepEqual(serialize({ nested: [{ when: { toDate: () => date } }] }), {
    nested: [{ when: date.toISOString() }],
  });
});
