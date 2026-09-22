const crypto = require("crypto");

function generatePlainToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(plain) {
  return crypto.createHash("sha256").update(plain).digest("hex");
}

module.exports = { generatePlainToken, hashToken };
