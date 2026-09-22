// scripts/backfill-test-passwords.js
require("dotenv").config();
const bcrypt = require("bcryptjs");
const db = require("../src/config/firestore");

const TEST_PASSWORD = "Test1234!"; // shared test login password — change/remove later

async function backfillPassword(userId) {
  const ref = db.collection("users").doc(userId);
  const snap = await ref.get();
  if (!snap.exists) return console.log(`skip: users/${userId} not found`);
  if (snap.data().password) return console.log(`skip: users/${userId} already has a password`);

  const hash = await bcrypt.hash(TEST_PASSWORD, 12); // 12 rounds — matches old User.js
  await ref.update({ password: hash });
  console.log(`ok: users/${userId} — login with "${TEST_PASSWORD}"`);
}

async function run() {
  await backfillPassword("alumni01");
  await backfillPassword("student01");
  process.exit(0);
}
run().catch((err) => { console.error(err); process.exit(1); });