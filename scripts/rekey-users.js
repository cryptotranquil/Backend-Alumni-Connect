// scripts/rekey-users.js
require("dotenv").config();
const db = require("../src/config/firestore");

const rekeys = [
  { oldId: "4rvKZX62TMdBH3TloSEA", newId: "alumni01" },
  { oldId: "GzPScvoo6FkOqrqqSJr1", newId: "student01" },
];

async function rekey(oldId, newId) {
  const oldRef = db.collection("users").doc(oldId);
  const newRef = db.collection("users").doc(newId);

  const oldSnap = await oldRef.get();
  if (!oldSnap.exists) return console.log(`skip: users/${oldId} not found (already re-keyed?)`);

  const newSnap = await newRef.get();
  if (newSnap.exists) return console.log(`skip: users/${newId} already exists`);

  await newRef.set(oldSnap.data());
  await oldRef.delete();
  console.log(`ok: users/${oldId} -> users/${newId}`);
}

async function run() {
  for (const { oldId, newId } of rekeys) await rekey(oldId, newId);
  process.exit(0);
}
run().catch((err) => { console.error(err); process.exit(1); });