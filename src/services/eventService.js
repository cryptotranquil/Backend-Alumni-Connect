const crypto = require("crypto");
const db = require("../config/firestore");
const eventsRef = db.collection("events");
const registrationsRef = db.collection("eventRegistrations");

function registrationId(eventId, userId) {
  return crypto
    .createHash("sha256")
    .update(`${eventId}\u0000${userId}`)
    .digest("hex");
}

function plain(doc) {
  return { id: doc.id, ...doc.data() };
}

async function listAll() {
  const snap = await eventsRef.get();
  return snap.docs.map(plain).sort((a, b) => {
    const at = a.startDate?.toMillis?.() || +new Date(a.startDate || 0);
    const bt = b.startDate?.toMillis?.() || +new Date(b.startDate || 0);
    return at - bt;
  });
}

async function findById(id) {
  const snap = await eventsRef.doc(id).get();
  return snap.exists ? plain(snap) : null;
}

async function createEvent(data) {
  const id = eventsRef.doc().id;
  const now = new Date();
  const doc = { ...data, createdAt: now, updatedAt: now };
  await eventsRef.doc(id).set(doc);
  return { id, ...doc };
}

async function deleteEvent(id) {
  await eventsRef.doc(id).delete();
  const regs = await registrationsRef.where("eventId", "==", id).get();
  if (regs.empty) return;
  const batch = db.batch();
  regs.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
}

async function findRegistration(eventId, userId) {
  const snap = await registrationsRef.doc(registrationId(eventId, userId)).get();
  return snap.exists ? plain(snap) : null;
}

async function register(eventId, userId) {
  const id = registrationId(eventId, userId);
  const ref = registrationsRef.doc(id);
  const existing = await ref.get();
  if (existing.exists) return plain(existing);
  const now = new Date();
  const doc = {
    eventId,
    userId,
    status: "registered",
    registeredAt: now,
    updatedAt: now,
  };
  await ref.set(doc);
  return { id, ...doc };
}

async function unregister(eventId, userId) {
  const ref = registrationsRef.doc(registrationId(eventId, userId));
  const snap = await ref.get();
  if (!snap.exists) return false;
  await ref.delete();
  return true;
}

async function listRegistrationsForEvent(eventId) {
  const snap = await registrationsRef.where("eventId", "==", eventId).get();
  return snap.docs.map(plain);
}

async function listRegistrationsForUser(userId) {
  const snap = await registrationsRef.where("userId", "==", userId).get();
  return snap.docs.map(plain);
}

async function listEventsForUser(userId) {
  const registrations = await listRegistrationsForUser(userId);
  const events = await Promise.all(
    registrations.map((registration) => findById(registration.eventId)),
  );
  return events.filter(Boolean);
}

async function listUpcoming(fromDate, toDate) {
  // Keep this index-free for easy deployment; event volume is modest.
  const events = await listAll();
  return events.filter((event) => {
    const date = event.startDate?.toDate
      ? event.startDate.toDate()
      : new Date(event.startDate);
    return date >= fromDate && date < toDate;
  });
}

module.exports = {
  listAll,
  findById,
  createEvent,
  deleteEvent,
  findRegistration,
  register,
  unregister,
  listRegistrationsForEvent,
  listRegistrationsForUser,
  listEventsForUser,
  listUpcoming,
};
