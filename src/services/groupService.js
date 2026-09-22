const crypto = require("crypto");
const db = require("../config/firestore");
const groupSeeds = require("../config/groupSeeds");
const userService = require("./userService");
const postService = require("./postService");

const groupsRef = db.collection("groups");
const membershipsRef = db.collection("groupMemberships");

function membershipId(groupId, userId) {
  return crypto
    .createHash("sha256")
    .update(`${groupId}\u0000${userId}`)
    .digest("hex");
}

async function ensureSeeded() {
  const batch = db.batch();
  const now = new Date();
  let changed = false;
  for (const seed of groupSeeds) {
    const ref = groupsRef.doc(seed.id);
    if (!(await ref.get()).exists) {
      const { id, ...data } = seed;
      batch.set(ref, { ...data, createdAt: now, updatedAt: now });
      changed = true;
    }
  }
  if (changed) await batch.commit();
}

async function findById(id) {
  await ensureSeeded();
  const snap = await groupsRef.doc(id).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function list(userId) {
  await ensureSeeded();
  const [groupsSnap, membershipsSnap] = await Promise.all([
    groupsRef.get(),
    membershipsRef.where("userId", "==", userId).get(),
  ]);
  const joined = new Set(
    membershipsSnap.docs.map((doc) => doc.data().groupId),
  );
  return groupsSnap.docs
    .map((doc) => ({
      _id: doc.id,
      ...doc.data(),
      joined: joined.has(doc.id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function isMember(groupId, userId) {
  return (await membershipsRef.doc(membershipId(groupId, userId)).get()).exists;
}

async function toggle(groupId, userId) {
  const group = await findById(groupId);
  if (!group) {
    const error = new Error("Group not found");
    error.status = 404;
    throw error;
  }
  const membershipRef = membershipsRef.doc(membershipId(groupId, userId));
  const groupRef = groupsRef.doc(groupId);
  let joined = false;
  let memberCount = Number(group.memberCount || 0);

  await db.runTransaction(async (transaction) => {
    const [membershipSnap, groupSnap] = await Promise.all([
      transaction.get(membershipRef),
      transaction.get(groupRef),
    ]);
    memberCount = Number(groupSnap.data()?.memberCount || 0);
    if (membershipSnap.exists) {
      transaction.delete(membershipRef);
      memberCount = Math.max(0, memberCount - 1);
      joined = false;
    } else {
      const now = new Date();
      transaction.set(membershipRef, { groupId, userId, createdAt: now });
      memberCount += 1;
      joined = true;
    }
    transaction.update(groupRef, { memberCount, updatedAt: new Date() });
  });
  return { joined, memberCount };
}

async function memberNames(groupId) {
  const snap = await membershipsRef.where("groupId", "==", groupId).get();
  const users = await Promise.all(
    snap.docs.slice(0, 20).map((doc) => userService.findById(doc.data().userId)),
  );
  return users
    .filter(Boolean)
    .map(
      (user) =>
        user.name || `${user.firstname || ""} ${user.lastname || ""}`.trim(),
    );
}

async function posts(groupId) {
  if (!(await findById(groupId))) return null;
  return postService.list({ groupId });
}

module.exports = {
  ensureSeeded,
  list,
  findById,
  isMember,
  toggle,
  memberNames,
  posts,
};
