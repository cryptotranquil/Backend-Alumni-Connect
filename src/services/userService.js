const db = require("../config/firestore");
const bcrypt = require("bcryptjs");

const usersRef = db.collection("users");
const profilesRef = db.collection("profiles");

function cleanObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  );
}

async function countUsers() {
  const snap = await usersRef.count().get();
  return snap.data().count;
}

async function findByEmail(email) {
  if (!email) return null;
  const snap = await usersRef
    .where("email", "==", email.toLowerCase().trim())
    .limit(1)
    .get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

async function findByRegistrationNumber(registrationNumber) {
  if (!registrationNumber) return null;
  const snap = await usersRef
    .where(
      "registrationNumber",
      "==",
      registrationNumber.trim().toUpperCase(),
    )
    .limit(1)
    .get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

async function findById(userId) {
  if (!userId) return null;
  const snap = await usersRef.doc(userId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

async function findByResetTokenHash(hash) {
  const snap = await usersRef
    .where("passwordResetTokenHash", "==", hash)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const user = { id: snap.docs[0].id, ...snap.docs[0].data() };
  const expires = user.passwordResetExpires?.toDate
    ? user.passwordResetExpires.toDate()
    : new Date(user.passwordResetExpires);
  return expires > new Date() ? user : null;
}

/** Reserve an ID before the user exists (registration claims a roster entry for it first). */
function newUserId() {
  return usersRef.doc().id;
}

async function createUser({ id: presetId, ...data }) {
  const id = presetId || usersRef.doc().id;
  const now = new Date();
  const hashedPassword = await bcrypt.hash(data.password, 12);
  const doc = cleanObject({
    ...data,
    email: data.email.toLowerCase().trim(),
    registrationNumber: data.registrationNumber
      ? data.registrationNumber.trim().toUpperCase()
      : undefined,
    password: hashedPassword,
    accountStatus: data.accountStatus || "active",
    mustChangePassword: Boolean(data.mustChangePassword),
    tokenVersion: 0,
    failedLoginAttempts: 0,
    lockUntil: null,
    createdAt: now,
    updatedAt: now,
  });
  await usersRef.doc(id).set(doc);
  return { id, ...doc };
}

async function updateUser(id, patch) {
  const next = cleanObject({ ...patch });
  if (typeof next.email === "string") {
    next.email = next.email.toLowerCase().trim();
  }
  if (typeof next.registrationNumber === "string") {
    next.registrationNumber = next.registrationNumber.trim().toUpperCase();
  }
  if (typeof next.password === "string") {
    next.password = await bcrypt.hash(next.password, 12);
  }
  await usersRef.doc(id).update({ ...next, updatedAt: new Date() });
}

async function deleteUser(id) {
  const batch = db.batch();
  batch.delete(usersRef.doc(id));
  batch.delete(profilesRef.doc(id));
  await batch.commit();
}

async function matchPassword(entered, hash) {
  if (!entered || !hash) return false;
  return bcrypt.compare(entered, hash);
}

async function listUsers() {
  const snap = await usersRef.get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

/** Merge legacy profiles/{id} data with the canonical users/{id} record. */
async function getFullUser(userId) {
  const [user, profileSnap] = await Promise.all([
    findById(userId),
    profilesRef.doc(userId).get(),
  ]);
  if (!user) return null;
  const profile = profileSnap.exists ? profileSnap.data() : {};
  return { ...profile, ...user, id: user.id };
}

async function listFullUsers() {
  const users = await listUsers();
  return Promise.all(users.map((user) => getFullUser(user.id)));
}

module.exports = {
  newUserId,
  countUsers,
  findByEmail,
  findByRegistrationNumber,
  findById,
  findByResetTokenHash,
  createUser,
  updateUser,
  deleteUser,
  matchPassword,
  listUsers,
  getFullUser,
  listFullUsers,
};
