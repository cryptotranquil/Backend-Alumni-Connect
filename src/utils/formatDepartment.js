// Mirrors utils/formatUser.js's contract: Firestore doc id -> _id,
// Firestore Timestamps -> ISO strings, so the frontend always gets the same
// shape regardless of the underlying store.
const formatDepartment = (dept) => {
  if (!dept) return null;
  const d = { ...dept };
  d._id = d.id;
  delete d.id;
  if (d.createdAt?.toDate) d.createdAt = d.createdAt.toDate().toISOString();
  else if (d.createdAt instanceof Date) d.createdAt = d.createdAt.toISOString();
  if (d.updatedAt?.toDate) d.updatedAt = d.updatedAt.toDate().toISOString();
  else if (d.updatedAt instanceof Date) d.updatedAt = d.updatedAt.toISOString();
  return d;
};

module.exports = formatDepartment;