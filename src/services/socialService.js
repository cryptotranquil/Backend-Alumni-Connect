const crypto = require("crypto");
const db = require("../config/firestore");
const userService = require("./userService");
const { serialize } = require("../utils/serialize");

const followsRef = db.collection("follows");
const recommendationsRef = db.collection("recommendations");
const endorsementsRef = db.collection("skillEndorsements");

function stableId(...parts) {
  return crypto.createHash("sha256").update(parts.join("\u0000")).digest("hex");
}

function userName(user) {
  return (
    user?.name ||
    `${user?.firstname || ""} ${user?.lastname || ""}`.trim() ||
    "Member"
  );
}

function headline(user) {
  if (user?.headline) return user.headline;
  if (user?.role === "alumni") {
    if ((user.position || user.jobTitle) && user.company) {
      return `${user.position || user.jobTitle} at ${user.company}`;
    }
    return `Alumni · Class of ${user.graduationYear || "—"}`;
  }
  return user?.program
    ? `Student · ${user.program} · ${user.department || "Exploits University"}`
    : "Student at Exploits University";
}

function presence(user, extras = {}) {
  return {
    _id: user.id,
    name: userName(user),
    profilePhoto: user.profilePhoto || "",
    headline: headline(user),
    program: user.program || user.programme || "",
    graduationYear: user.graduationYear || "",
    company: user.company || "",
    position: user.position || user.jobTitle || "",
    mutual: extras.mutual || 0,
    since: serialize(extras.since),
  };
}

async function isFollowing(followerId, targetId) {
  const snap = await followsRef.doc(stableId(followerId, targetId)).get();
  return snap.exists;
}

async function toggleFollow(followerId, targetId) {
  if (followerId === targetId) {
    const error = new Error("You cannot follow yourself");
    error.status = 400;
    throw error;
  }
  if (!(await userService.findById(targetId))) {
    const error = new Error("User not found");
    error.status = 404;
    throw error;
  }
  const ref = followsRef.doc(stableId(followerId, targetId));
  const snap = await ref.get();
  if (snap.exists) {
    await ref.delete();
    return false;
  }
  const now = new Date();
  await ref.set({ followerId, targetId, createdAt: now, updatedAt: now });
  return true;
}

async function listFollowDocs(field, value) {
  const snap = await followsRef.where(field, "==", value).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function listFollowers(targetId) {
  const docs = await listFollowDocs("targetId", targetId);
  const users = await Promise.all(
    docs.map((follow) => userService.getFullUser(follow.followerId)),
  );
  return users
    .map((user, index) =>
      user ? presence(user, { since: docs[index].createdAt }) : null,
    )
    .filter(Boolean);
}

async function listFollowing(followerId) {
  const docs = await listFollowDocs("followerId", followerId);
  const users = await Promise.all(
    docs.map((follow) => userService.getFullUser(follow.targetId)),
  );
  return users
    .map((user, index) =>
      user ? presence(user, { since: docs[index].createdAt }) : null,
    )
    .filter(Boolean);
}

async function getFollowingIds(followerId) {
  const docs = await listFollowDocs("followerId", followerId);
  return docs.map((follow) => follow.targetId);
}

async function getRecommendations(targetUserId) {
  const snap = await recommendationsRef
    .where("targetUserId", "==", targetUserId)
    .get();
  const records = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  records.sort((a, b) => {
    const at = a.createdAt?.toMillis?.() || +new Date(a.createdAt || 0);
    const bt = b.createdAt?.toMillis?.() || +new Date(b.createdAt || 0);
    return bt - at;
  });
  const authors = await Promise.all(
    records.map((record) => userService.getFullUser(record.fromUserId)),
  );
  return records.map((record, index) => {
    const author = authors[index];
    return serialize({
      _id: record.id,
      from: {
        _id: record.fromUserId,
        name: userName(author),
        role: author?.role || "alumni",
        position: author?.position || author?.jobTitle || "",
      },
      relation: record.relation,
      text: record.text,
      createdAt: record.createdAt,
    });
  });
}

async function addRecommendation({ targetUserId, fromUserId, relation, text }) {
  if (targetUserId === fromUserId) {
    const error = new Error("You cannot recommend yourself");
    error.status = 400;
    throw error;
  }
  if (!(await userService.findById(targetUserId))) {
    const error = new Error("User not found");
    error.status = 404;
    throw error;
  }
  const now = new Date();
  await recommendationsRef.add({
    targetUserId,
    fromUserId,
    relation,
    text: text.trim(),
    createdAt: now,
    updatedAt: now,
  });
  return getRecommendations(targetUserId);
}

async function getSkillEndorsements(targetUserId) {
  const target = await userService.getFullUser(targetUserId);
  if (!target) return null;
  const result = Object.fromEntries((target.skills || []).map((skill) => [skill, 0]));
  const snap = await endorsementsRef
    .where("targetUserId", "==", targetUserId)
    .get();
  snap.docs.forEach((doc) => {
    const skill = doc.data().skill;
    result[skill] = (result[skill] || 0) + 1;
  });
  return result;
}

async function endorseSkill(targetUserId, endorserId, skill) {
  if (targetUserId === endorserId) {
    const error = new Error("You cannot endorse your own skill");
    error.status = 400;
    throw error;
  }
  const target = await userService.getFullUser(targetUserId);
  const canonicalSkill = (target?.skills || []).find(
    (item) => item.toLowerCase() === String(skill || "").trim().toLowerCase(),
  );
  if (!target || !canonicalSkill) {
    const error = new Error("Skill not found on this profile");
    error.status = 404;
    throw error;
  }

  const ref = endorsementsRef.doc(
    stableId(targetUserId, canonicalSkill.toLowerCase(), endorserId),
  );
  if (!(await ref.get()).exists) {
    const now = new Date();
    await ref.set({
      targetUserId,
      endorserId,
      skill: canonicalSkill,
      createdAt: now,
      updatedAt: now,
    });
  }
  const counts = await getSkillEndorsements(targetUserId);
  return { skill: canonicalSkill, count: counts[canonicalSkill] || 0 };
}

module.exports = {
  presence,
  headline,
  isFollowing,
  toggleFollow,
  listFollowers,
  listFollowing,
  getFollowingIds,
  getRecommendations,
  addRecommendation,
  getSkillEndorsements,
  endorseSkill,
};
