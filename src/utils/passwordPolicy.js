/**
 * Strong-password policy shared by registration, password reset, password
 * change and admin invitations.
 *
 * A password must contain:
 *   - 8 to 72 bytes (bcrypt silently ignores anything after 72 bytes)
 *   - a lowercase letter, an uppercase letter, a number and a symbol
 *
 * Keep this in sync with frontend/src/lib/passwordPolicy.ts.
 */
const MIN_LENGTH = 8;
const MAX_BYTES = 72;

const RULES = [
  {
    id: "length",
    label: `at least ${MIN_LENGTH} characters`,
    test: (p) => p.length >= MIN_LENGTH,
  },
  { id: "lowercase", label: "a lowercase letter", test: (p) => /[a-z]/.test(p) },
  { id: "uppercase", label: "an uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { id: "number", label: "a number", test: (p) => /[0-9]/.test(p) },
  { id: "symbol", label: "a symbol (e.g. ! @ # $ %)", test: (p) => /[^A-Za-z0-9\s]/.test(p) },
];

function joinLabels(labels) {
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

function checkPassword(password) {
  const value = typeof password === "string" ? password : "";
  if (Buffer.byteLength(value, "utf8") > MAX_BYTES) {
    return {
      ok: false,
      failed: ["max"],
      message: `Password must be at most ${MAX_BYTES} characters.`,
    };
  }
  const failed = RULES.filter((rule) => !rule.test(value));
  if (failed.length === 0) return { ok: true, failed: [], message: "" };
  return {
    ok: false,
    failed: failed.map((rule) => rule.id),
    message: `Password must include ${joinLabels(failed.map((rule) => rule.label))}.`,
  };
}

module.exports = { checkPassword, RULES, MIN_LENGTH, MAX_BYTES };
