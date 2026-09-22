const test = require("node:test");
const assert = require("node:assert/strict");
const {
  cleanRegistrationNumber,
  normalizeRegistrationNumber,
  isValidRegistrationNumber,
  parseRegistrationNumber,
  toDocId,
  toDocIdPrefix,
} = require("../src/utils/registrationNumber");

test("a correct number is valid and unchanged", () => {
  assert.equal(isValidRegistrationNumber("BIT/24/BT/ME/009"), true);
  assert.equal(normalizeRegistrationNumber("BIT/24/BT/ME/009"), "BIT/24/BT/ME/009");
});

test("normalisation ignores case, spaces, odd separators and invisible characters", () => {
  const expected = "BIT/24/BT/ME/009";
  assert.equal(normalizeRegistrationNumber(" bit/24/bt/me/009 "), expected);
  assert.equal(normalizeRegistrationNumber("BIT / 24 / BT / ME / 009"), expected);
  assert.equal(normalizeRegistrationNumber("BIT-24-BT-ME-009"), expected);
  assert.equal(normalizeRegistrationNumber("BIT\\24\\BT\\ME\\009"), expected);
  assert.equal(normalizeRegistrationNumber("BIT_24_BT_ME_009"), expected);
  assert.equal(normalizeRegistrationNumber("\uFEFFBIT/24/BT/ME/009\u200B"), expected);
  assert.equal(normalizeRegistrationNumber("BIT//24/BT/ME/009"), expected);
});

test("the sequence is padded to three digits so 9, 09 and 009 match", () => {
  assert.equal(normalizeRegistrationNumber("BIT/24/BT/ME/9"), "BIT/24/BT/ME/009");
  assert.equal(normalizeRegistrationNumber("BIT/24/BT/ME/09"), "BIT/24/BT/ME/009");
  assert.equal(normalizeRegistrationNumber("BIT/24/BT/ME/0009"), "BIT/24/BT/ME/009");
  assert.equal(normalizeRegistrationNumber("BIT/24/BT/ME/1250"), "BIT/24/BT/ME/1250");
});

test("wrong shapes are rejected", () => {
  for (const bad of ["", "BIT/24/BT/ME", "BIT/2024/BT/ME/009", "B/24/BT/ME/009", "BIT/24/BT/ME/ABC",
    "BIT/24/BT/ME/009/X", "12345", "BIT/24/B1/ME/009", null, undefined]) {
    assert.equal(isValidRegistrationNumber(bad), false, `expected ${JSON.stringify(bad)} to be invalid`);
  }
});

test("parse splits the number into its parts and reads 24 as the registration year", () => {
  assert.deepEqual(parseRegistrationNumber("bit/24/bt/me/9"), {
    normalized: "BIT/24/BT/ME/009",
    programCode: "BIT",
    admissionYear: "2024",
    locationCode: "BT",
    entryType: "ME",
    sequence: "009",
  });
  assert.equal(parseRegistrationNumber("nonsense"), null);
});

test("document IDs never contain a slash and are reversible in meaning", () => {
  assert.equal(toDocId("BIT/24/BT/ME/9"), "BIT-24-BT-ME-009");
  assert.equal(toDocId("bit-24-bt-me-009"), "BIT-24-BT-ME-009");
  assert.ok(!toDocId("BIT/24/BT/ME/009").includes("/"));
});

test("search prefixes are cleaned but not padded", () => {
  assert.equal(cleanRegistrationNumber("bit/24/"), "BIT/24");
  assert.equal(toDocIdPrefix("bit / 24"), "BIT-24");
});
