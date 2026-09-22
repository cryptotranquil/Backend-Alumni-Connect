const db = require("../config/firestore");

const requestsRef = db.collection("mentorshipRequests");
const matchesRef = db.collection("mentorshipMatches");
const offersRef = db.collection("mentorshipOffers");

const toPlain = (doc) => ({ id: doc.id, ...doc.data() });

function newestFirst(items) {
  return items.sort((a, b) => {
    const at = a.createdAt?.toMillis?.() || +new Date(a.createdAt || 0);
    const bt = b.createdAt?.toMillis?.() || +new Date(b.createdAt || 0);
    return bt - at;
  });
}

async function createRequest(data) {
  const id = requestsRef.doc().id;
  const now = new Date();
  const doc = {
    skillsRequested: [],
    interests: [],
    careerGoals: "",
    preferredIndustry: "",
    message: "",
    matchScore: null,
    matchDetails: null,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    ...data,
  };
  await requestsRef.doc(id).set(doc);
  return { id, ...doc };
}

async function findRequestById(id) {
  const snap = await requestsRef.doc(id).get();
  return snap.exists ? toPlain(snap) : null;
}

async function updateRequest(id, patch) {
  await requestsRef.doc(id).update({ ...patch, updatedAt: new Date() });
  return findRequestById(id);
}

async function deleteRequest(id) {
  await requestsRef.doc(id).delete();
}

async function listRequestsByStudent(studentId) {
  const snap = await requestsRef.where("studentId", "==", studentId).get();
  return newestFirst(snap.docs.map(toPlain));
}

async function listPendingRequestsForMentor(mentorId) {
  const snap = await requestsRef.where("mentorId", "==", mentorId).get();
  return newestFirst(
    snap.docs.map(toPlain).filter((request) => request.status === "pending"),
  );
}

async function findRequestBetween(studentId, mentorId) {
  const requests = (await listRequestsByStudent(studentId)).filter(
    (request) => request.mentorId === mentorId,
  );
  // Prefer an actionable pending request over older rejected history.
  return requests.find((request) => request.status === "pending") || requests[0] || null;
}

async function rejectOtherPendingRequests(studentId, exceptRequestId) {
  const requests = (await listRequestsByStudent(studentId)).filter(
    (request) => request.status === "pending" && request.id !== exceptRequestId,
  );
  if (!requests.length) return;
  const batch = db.batch();
  requests.forEach((request) => {
    batch.update(requestsRef.doc(request.id), {
      status: "rejected",
      updatedAt: new Date(),
    });
  });
  await batch.commit();
}

async function createMatch(data) {
  const existing = await findMatchBetween(data.studentId, data.mentorId);
  if (existing) return existing;
  const id = matchesRef.doc().id;
  const now = new Date();
  const doc = {
    conversationId: null,
    completedAt: null,
    feedback: null,
    status: "active",
    startedAt: now,
    createdAt: now,
    updatedAt: now,
    ...data,
  };
  await matchesRef.doc(id).set(doc);
  return { id, ...doc };
}

async function findMatchById(id) {
  const snap = await matchesRef.doc(id).get();
  return snap.exists ? toPlain(snap) : null;
}

async function updateMatch(id, patch) {
  await matchesRef.doc(id).update({ ...patch, updatedAt: new Date() });
  return findMatchById(id);
}

async function listMatchesForUser(userId, role, status) {
  const field = role === "student" ? "studentId" : "mentorId";
  const snap = await matchesRef.where(field, "==", userId).get();
  const matches = snap.docs.map(toPlain);
  return status ? matches.filter((match) => match.status === status) : matches;
}

async function listAllMatches(status) {
  const snap = await matchesRef.get();
  const matches = snap.docs.map(toPlain);
  return status ? matches.filter((match) => match.status === status) : matches;
}

async function findMatchBetween(studentId, mentorId, status = "active") {
  const matches = await listMatchesForUser(studentId, "student");
  return (
    matches.find(
      (match) => match.mentorId === mentorId && match.status === status,
    ) || null
  );
}

async function studentHasActiveEngagement(studentId) {
  const [requests, activeMatches] = await Promise.all([
    listRequestsByStudent(studentId),
    listMatchesForUser(studentId, "student", "active"),
  ]);
  return (
    requests.some((request) => request.status === "pending") ||
    activeMatches.length > 0
  );
}

async function createOffer(mentorId, studentId) {
  const existing = await findOfferBetween(mentorId, studentId);
  if (existing) return existing;
  const id = offersRef.doc().id;
  const now = new Date();
  const doc = {
    mentorId,
    studentId,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
  await offersRef.doc(id).set(doc);
  return { id, ...doc };
}

async function findOfferBetween(mentorId, studentId) {
  const offers = await listOffersByMentor(mentorId);
  return offers.find((offer) => offer.studentId === studentId) || null;
}

async function listOffersByMentor(mentorId) {
  const snap = await offersRef.where("mentorId", "==", mentorId).get();
  return newestFirst(snap.docs.map(toPlain));
}

module.exports = {
  createRequest,
  findRequestById,
  updateRequest,
  deleteRequest,
  listRequestsByStudent,
  listPendingRequestsForMentor,
  findRequestBetween,
  rejectOtherPendingRequests,
  createMatch,
  findMatchById,
  updateMatch,
  listMatchesForUser,
  listAllMatches,
  findMatchBetween,
  studentHasActiveEngagement,
  createOffer,
  findOfferBetween,
  listOffersByMentor,
};
