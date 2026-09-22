const db = require("../config/firestore");

const auditLogsRef = db.collection("auditLogs");

/** Record one admin action. Never throws into the caller's response path —
 *  callers should catch/log and continue, since a logging failure must not
 *  block the admin action itself. */
async function record({ actorId, actorEmail, action, targetId, method, path, ip }) {
  await auditLogsRef.add({
    actorId: actorId || null,
    actorEmail: actorEmail || null,
    action,
    targetId: targetId || null,
    method: method || null,
    path: path || null,
    ip: ip || null,
    createdAt: new Date(),
  });
}

/** Newest-first, cursor-paginated read — deliberately not a whole-collection
 *  read, unlike several older list endpoints in this codebase. */
async function list({ limit = 50, cursor } = {}) {
  let query = auditLogsRef.orderBy("createdAt", "desc").limit(limit);
  if (cursor) {
    const cursorDoc = await auditLogsRef.doc(cursor).get();
    if (cursorDoc.exists) query = query.startAfter(cursorDoc);
  }
  const snap = await query.get();
  const logs = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const nextCursor = snap.docs.length === limit ? snap.docs[snap.docs.length - 1].id : null;
  return { logs, nextCursor };
}

module.exports = { record, list };
