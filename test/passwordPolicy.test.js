const test = require("node:test");
const assert = require("node:assert/strict");
const { checkPassword } = require("../src/utils/passwordPolicy");

test("accepts a password with lowercase, uppercase, number and symbol", () => {
  assert.equal(checkPassword("Sunrise#2026").ok, true);
  assert.equal(checkPassword("aB3$aB3$").ok, true);
});

test("rejects each missing character class with a specific message", () => {
  assert.match(checkPassword("SUNRISE#2026").message, /lowercase letter/);
  assert.match(checkPassword("sunrise#2026").message, /uppercase letter/);
  assert.match(checkPassword("Sunrise#Today").message, /a number/);
  assert.match(checkPassword("Sunrise2026x").message, /a symbol/);
  assert.match(checkPassword("Ab1#").message, /at least 8 characters/);
});

test("lists every missing requirement at once", () => {
  const result = checkPassword("password");
  assert.equal(result.ok, false);
  assert.deepEqual(result.failed, ["uppercase", "number", "symbol"]);
});

test("spaces do not count as symbols", () => {
  assert.equal(checkPassword("Sunrise 2026").ok, false);
});

test("rejects passwords longer than bcrypt can hash and non-strings", () => {
  assert.equal(checkPassword(`Aa1#${"x".repeat(80)}`).ok, false);
  assert.equal(checkPassword(undefined).ok, false);
  assert.equal(checkPassword(12345678).ok, false);
});
