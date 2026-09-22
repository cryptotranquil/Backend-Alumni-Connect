const db = require("../config/firestore");
const businessesRef = db.collection("businesses");
const reviewsRef = db.collection("businessReviews");

async function listAll() {
  const snap = await businessesRef.get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => {
      const at = a.createdAt?.toMillis?.() || +new Date(a.createdAt || 0);
      const bt = b.createdAt?.toMillis?.() || +new Date(b.createdAt || 0);
      return bt - at;
    });
}
async function findById(id) {
  const snap = await businessesRef.doc(id).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}
async function createBusiness(data) {
  const id = businessesRef.doc().id;
  const now = new Date();
  const doc = { ...data, createdAt: now, updatedAt: now };
  await businessesRef.doc(id).set(doc);
  return { id, ...doc };
}
async function updateBusiness(id, patch) {
  await businessesRef.doc(id).update({ ...patch, updatedAt: new Date() });
}
async function deleteBusiness(id) {
  await businessesRef.doc(id).delete();
  const revSnap = await reviewsRef.where("businessId", "==", id).get();
  const batch = db.batch();
  revSnap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
}
async function createReview(businessId, reviewerId, comment) {
  const id = reviewsRef.doc().id;
  const now = new Date();
  const doc = { businessId, reviewerId, comment, status: "pending", createdAt: now, updatedAt: now };
  await reviewsRef.doc(id).set(doc);
  return { id, ...doc };
}
async function listReviewsForBusiness(businessId, status = null) {
  const snap = await reviewsRef.where("businessId", "==", businessId).get();
  const reviews = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return status ? reviews.filter((review) => review.status === status) : reviews;
}
async function findReviewById(id) {
  const snap = await reviewsRef.doc(id).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}
async function updateReviewStatus(id, status) {
  await reviewsRef.doc(id).update({ status, updatedAt: new Date() });
}
async function deleteReview(id) {
  await reviewsRef.doc(id).delete();
}
async function listPendingReviews() {
  const snap = await reviewsRef.where("status", "==", "pending").get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

module.exports = { listAll, findById, createBusiness, updateBusiness, deleteBusiness, createReview, listReviewsForBusiness, findReviewById, updateReviewStatus, deleteReview, listPendingReviews };