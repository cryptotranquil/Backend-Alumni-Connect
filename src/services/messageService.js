const db = require("../config/firestore");
const conversationsRef = db.collection("conversations");

/** Deterministic, order-independent conversation id for a pair — avoids a
 *  query to check "does this conversation exist" before creating one. */
function conversationIdFor(userIdA, userIdB) {
  return [userIdA, userIdB].sort().join("_");
}

async function findOrCreateConversation(userIdA, userIdB, mentorshipMatchId = null) {
  const id = conversationIdFor(userIdA, userIdB);
  const ref = conversationsRef.doc(id);
  const snap = await ref.get();
  if (snap.exists) return { id: snap.id, ...snap.data() };

  const now = new Date();
  const doc = { participantIds: [userIdA, userIdB], mentorshipMatchId, lastMessage: null, lastMessageAt: null, lastMessageSenderId: null, createdAt: now, updatedAt: now };
  await ref.set(doc);
  return { id, ...doc };
}

async function findConversationBetween(userIdA, userIdB) {
  const snap = await conversationsRef.doc(conversationIdFor(userIdA, userIdB)).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function listConversationsForUser(userId) {
  const snap = await conversationsRef
    .where("participantIds", "array-contains", userId)
    .get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => {
      const at = a.updatedAt?.toMillis?.() || +new Date(a.updatedAt || 0);
      const bt = b.updatedAt?.toMillis?.() || +new Date(b.updatedAt || 0);
      return bt - at;
    });
}

async function sendMessage(conversationId, senderId, receiverId, text) {
  const conversationRef = conversationsRef.doc(conversationId);
  const messageRef = conversationRef.collection("messages").doc();
  const now = new Date();

  const batch = db.batch();
  batch.set(messageRef, { senderId, receiverId, message: text, read: false, createdAt: now });
  batch.update(conversationRef, { lastMessage: text, lastMessageAt: now, lastMessageSenderId: senderId, updatedAt: now });
  await batch.commit();

  return { id: messageRef.id, senderId, receiverId, message: text, read: false, createdAt: now };
}

async function listMessages(conversationId) {
  const snap = await conversationsRef.doc(conversationId).collection("messages").orderBy("createdAt", "asc").get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function markThreadRead(conversationId, readerId) {
  const snap = await conversationsRef
    .doc(conversationId)
    .collection("messages")
    .where("receiverId", "==", readerId)
    .get();
  const unread = snap.docs.filter((doc) => !doc.data().read);
  if (unread.length === 0) return;
  const batch = db.batch();
  unread.forEach((doc) => batch.update(doc.ref, { read: true }));
  await batch.commit();
}

async function countUnread(conversationId, readerId) {
  const snap = await conversationsRef
    .doc(conversationId)
    .collection("messages")
    .where("receiverId", "==", readerId)
    .get();
  return snap.docs.filter((doc) => !doc.data().read).length;
}

module.exports = { findOrCreateConversation, findConversationBetween, listConversationsForUser, sendMessage, listMessages, markThreadRead, countUnread };