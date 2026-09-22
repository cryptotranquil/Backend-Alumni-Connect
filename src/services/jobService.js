const crypto = require("crypto");
const db = require("../config/firestore");

const jobsRef = db.collection("jobPosts");
const referralsRef = db.collection("jobReferrals");

function stableReferralId(jobId, referrerId, studentId) {
  return crypto
    .createHash("sha256")
    .update(`${jobId}\u0000${referrerId}\u0000${studentId}`)
    .digest("hex");
}

function plain(doc) {
  return { id: doc.id, ...doc.data() };
}

async function findById(id) {
  const snap = await jobsRef.doc(id).get();
  return snap.exists ? plain(snap) : null;
}

async function listForUser(role, userId) {
  const snap = await jobsRef.get();
  let jobs = snap.docs.map(plain);
  if (role !== "admin") {
    jobs = jobs.filter(
      (job) => job.status === "approved" || job.postedBy === userId,
    );
  }
  return jobs.sort((a, b) => {
    const at = a.createdAt?.toMillis?.() || +new Date(a.createdAt || 0);
    const bt = b.createdAt?.toMillis?.() || +new Date(b.createdAt || 0);
    return bt - at;
  });
}

async function createJob(data) {
  const id = jobsRef.doc().id;
  const now = new Date();
  const doc = {
    ...data,
    applicants: [],
    applicantsCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  await jobsRef.doc(id).set(doc);
  return { id, ...doc };
}

async function updateJob(id, patch) {
  await jobsRef.doc(id).update({ ...patch, updatedAt: new Date() });
}

async function deleteJob(id) {
  await jobsRef.doc(id).delete();
}

async function addApplicant(id, userId) {
  const ref = jobsRef.doc(id);
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) return;
    const applicants = snap.data().applicants || [];
    if (applicants.includes(userId)) return;
    const next = [...applicants, userId];
    transaction.update(ref, {
      applicants: next,
      applicantsCount: next.length,
      updatedAt: new Date(),
    });
  });
  return findById(id);
}

async function countByStatus(status) {
  const snap = await jobsRef.where("status", "==", status).get();
  return snap.size;
}

async function listAppliedByUser(userId) {
  const snap = await jobsRef
    .where("applicants", "array-contains", userId)
    .get();
  return snap.docs.map(plain);
}

async function countAppliedByUser(userId) {
  const jobs = await listAppliedByUser(userId);
  return jobs.filter((job) => job.status === "approved").length;
}

async function listApproved() {
  const snap = await jobsRef.where("status", "==", "approved").get();
  return snap.docs.map(plain);
}

async function createReferral({ jobId, studentId, referrerId, note }) {
  const id = stableReferralId(jobId, referrerId, studentId);
  const ref = referralsRef.doc(id);
  const existing = await ref.get();
  if (existing.exists) return { id: existing.id, ...existing.data() };
  const now = new Date();
  const doc = { jobId, studentId, referrerId, note: note || "", createdAt: now };
  await ref.set(doc);
  return { id, ...doc };
}

async function hasReferral(jobId, referrerId) {
  const snap = await referralsRef.where("jobId", "==", jobId).get();
  return snap.docs.some((doc) => doc.data().referrerId === referrerId);
}

module.exports = {
  findById,
  listForUser,
  createJob,
  updateJob,
  deleteJob,
  addApplicant,
  countByStatus,
  countAppliedByUser,
  listAppliedByUser,
  listApproved,
  createReferral,
  hasReferral,
};
