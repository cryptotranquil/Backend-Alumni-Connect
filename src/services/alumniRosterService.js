/**
 * Alumni roster: the list of known alumni an admin imports from CSV/Excel.
 * A registering alumnus whose registration number is in the roster (and not
 * yet claimed) can be approved automatically.
 *
 * Collections
 *   alumniRoster/{BIT-24-BT-ME-009}   one doc per alumnus (ID = number with "/" -> "-")
 *   rosterImports/{auto}              one doc per real import (history)
 *
 * Follows the app's conventions: deterministic IDs instead of queries, no
 * composite indexes, Date objects for timestamps.
 */

const crypto = require("crypto");
const {
  parseRegistrationNumber,
  toDocId,
  toDocIdPrefix,
} = require("../utils/registrationNumber");

const COLLECTION = "alumniRoster";
const IMPORTS_COLLECTION = "rosterImports";
const BATCH_SIZE = 400; // Firestore allows 500 writes per batch
const READ_CHUNK = 300; // documents per getAll call

// Fields an admin may edit by hand. Claim fields are only changed by claim()/release().
const EDITABLE_FIELDS = ["fullName", "department", "program", "graduationYear", "email"];

const chunk = (items, size) => {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

const descriptive = (record) => ({
  fullName: record.fullName || "",
  department: record.department || "",
  program: record.program || "",
  graduationYear: record.graduationYear || "",
  email: (record.email || "").toLowerCase(),
});

/**
 * `getDb` is called lazily so tests can pass a fake Firestore and the real
 * one is only loaded (and credentials only needed) when the service is used.
 */
function createAlumniRosterService(getDb = () => require("../config/firestore")) {
  const col = () => getDb().collection(COLLECTION);
  const importsCol = () => getDb().collection(IMPORTS_COLLECTION);
  const entry = (snap) => (snap.exists ? { id: snap.id, ...snap.data() } : null);

  async function findByRegistrationNumber(input) {
    const id = toDocId(input);
    if (!parseRegistrationNumber(input)) return null;
    return entry(await col().doc(id).get());
  }

  /** Looks up many numbers at once. Returns Map(docId -> entry). */
  async function getMany(docIds) {
    const found = new Map();
    for (const ids of chunk([...new Set(docIds)], READ_CHUNK)) {
      const snaps = await getDb().getAll(...ids.map((id) => col().doc(id)));
      snaps.forEach((snap) => { if (snap.exists) found.set(snap.id, entry(snap)); });
    }
    return found;
  }

  /**
   * Imports validated records (see utils/rosterFile).
   *   new number            -> created
   *   existing, unclaimed   -> descriptive fields updated
   *   existing, claimed     -> left untouched (counted as skippedClaimed)
   * With dryRun: true it only reports the counts and writes nothing.
   */
  async function applyImport(records, { batchId = crypto.randomUUID(), dryRun = false } = {}) {
    const existing = await getMany(records.map((r) => toDocId(r.registrationNumber)));
    const now = new Date();
    const result = { batchId, dryRun, created: 0, updated: 0, skippedClaimed: 0 };
    const writes = [];

    for (const record of records) {
      const id = toDocId(record.registrationNumber);
      const current = existing.get(id);
      if (!current) {
        result.created += 1;
        const parts = parseRegistrationNumber(record.registrationNumber);
        writes.push({
          id,
          type: "set",
          data: {
            registrationNumber: parts.normalized,
            ...descriptive(record),
            programCode: parts.programCode,
            admissionYear: parts.admissionYear,
            locationCode: parts.locationCode,
            entryType: parts.entryType,
            sequence: parts.sequence,
            status: "unclaimed",
            claimedBy: null,
            claimedAt: null,
            importBatchId: batchId,
            createdAt: now,
            updatedAt: now,
          },
        });
      } else if (current.status === "claimed") {
        result.skippedClaimed += 1;
      } else {
        result.updated += 1;
        writes.push({
          id,
          type: "update",
          data: { ...descriptive(record), importBatchId: batchId, updatedAt: now },
        });
      }
    }

    if (!dryRun) {
      for (const group of chunk(writes, BATCH_SIZE)) {
        const batch = getDb().batch();
        for (const write of group) {
          const ref = col().doc(write.id);
          // create() (not set) fails if the number appeared after the preview, so an
          // entry added by someone else in the meantime is never silently overwritten.
          if (write.type === "set") batch.create(ref, write.data);
          else batch.update(ref, write.data);
        }
        try {
          await batch.commit();
        } catch (error) {
          if (error.code === 6 || error.code === "ALREADY_EXISTS") {
            const conflict = new Error("The roster changed while the import was running. Run the import again; entries already saved are kept.");
            conflict.status = 409;
            throw conflict;
          }
          throw error;
        }
      }
    }
    return result;
  }

  /**
   * Claims a roster entry for a user, atomically. Called at registration.
   * Returns { ok: true, entry } or { ok: false, reason: "not_found" | "already_claimed" }.
   */
  async function claim(input, userId) {
    if (!parseRegistrationNumber(input)) return { ok: false, reason: "not_found" };
    const ref = col().doc(toDocId(input));
    return getDb().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { ok: false, reason: "not_found" };
      if (snap.data().status === "claimed") return { ok: false, reason: "already_claimed" };
      const now = new Date();
      tx.update(ref, { status: "claimed", claimedBy: userId, claimedAt: now, updatedAt: now });
      return { ok: true, entry: { id: snap.id, ...snap.data(), status: "claimed", claimedBy: userId, claimedAt: now } };
    });
  }

  /**
   * Undoes claim() (for example if creating the user failed). Only the claimant
   * can release it, unless `force` is set (an admin freeing a wrongly claimed entry).
   */
  async function release(input, userId, { force = false } = {}) {
    if (!parseRegistrationNumber(input)) return { ok: false, reason: "not_found" };
    const ref = col().doc(toDocId(input));
    return getDb().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { ok: false, reason: "not_found" };
      if (!force && snap.data().claimedBy !== userId) return { ok: false, reason: "not_claimant" };
      tx.update(ref, { status: "unclaimed", claimedBy: null, claimedAt: null, updatedAt: new Date() });
      return { ok: true };
    });
  }

  /** Adds one entry by hand. Returns { ok: false, reason } if the number is invalid or already exists. */
  async function create(record, { batchId = "manual" } = {}) {
    const parts = parseRegistrationNumber(record.registrationNumber);
    if (!parts) return { ok: false, reason: "invalid_number" };
    const ref = col().doc(toDocId(parts.normalized));
    const now = new Date();
    return getDb().runTransaction(async (tx) => {
      if ((await tx.get(ref)).exists) return { ok: false, reason: "exists" };
      const data = {
        registrationNumber: parts.normalized,
        ...descriptive(record),
        programCode: parts.programCode,
        admissionYear: parts.admissionYear,
        locationCode: parts.locationCode,
        entryType: parts.entryType,
        sequence: parts.sequence,
        status: "unclaimed",
        claimedBy: null,
        claimedAt: null,
        importBatchId: batchId,
        createdAt: now,
        updatedAt: now,
      };
      tx.set(ref, data);
      return { ok: true, entry: { id: ref.id, ...data } };
    });
  }

  /** Edits descriptive fields only; the registration number and claim state never change here. */
  async function update(input, patch) {
    const current = await findByRegistrationNumber(input);
    if (!current) return { ok: false, reason: "not_found" };
    const changes = {};
    for (const field of EDITABLE_FIELDS) {
      if (patch[field] !== undefined) {
        changes[field] = field === "email" ? String(patch[field]).toLowerCase().trim() : String(patch[field]).trim();
      }
    }
    changes.updatedAt = new Date();
    await col().doc(current.id).update(changes);
    return { ok: true, entry: { ...current, ...changes } };
  }

  /** Deletes an entry, but never one that a user has claimed. */
  async function remove(input) {
    const current = await findByRegistrationNumber(input);
    if (!current) return { ok: false, reason: "not_found" };
    if (current.status === "claimed") return { ok: false, reason: "claimed" };
    await col().doc(current.id).delete();
    return { ok: true };
  }

  /**
   * One page of roster entries, ordered by number.
   *   prefix  matches the start of the number ("BIT/24"); status is then filtered
   *           in memory, so a page can hold fewer than `limit` entries
   *   status  "claimed" | "unclaimed" (used as a query filter when there is no prefix)
   *   after   the `nextCursor` of the previous page
   */
  async function list({ status, prefix, limit = 50, after } = {}) {
    const size = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    let query = col();

    if (prefix) {
      const p = toDocIdPrefix(prefix);
      query = query.where("__name__", ">=", p).where("__name__", "<", `${p}\uf8ff`);
    } else if (status) {
      query = query.where("status", "==", status);
    }
    if (after) {
      const cursorSnap = await col().doc(after).get();
      if (cursorSnap.exists) query = query.startAfter(cursorSnap);
    }

    const snap = await query.limit(size + 1).get();
    let docs = snap.docs;
    const hasMore = docs.length > size;
    if (hasMore) docs = docs.slice(0, size);

    let entries = docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    if (prefix && status) entries = entries.filter((e) => e.status === status);
    return { entries, nextCursor: hasMore ? docs[docs.length - 1].id : null };
  }

  /** Totals for the admin dashboard, using cheap aggregate counts. */
  async function stats() {
    const [total, unclaimed] = await Promise.all([
      col().count().get(),
      col().where("status", "==", "unclaimed").count().get(),
    ]);
    const totalCount = total.data().count;
    const unclaimedCount = unclaimed.data().count;
    return { total: totalCount, unclaimed: unclaimedCount, claimed: totalCount - unclaimedCount };
  }

  /** Writes one history record for a real (non-dry-run) import. */
  async function recordImport({ batchId, fileName, uploadedBy, uploadedByEmail, totalRows, errorRows, created, updated, skippedClaimed }) {
    const ref = importsCol().doc(batchId);
    await ref.set({
      fileName: fileName || "",
      uploadedBy: uploadedBy || null,
      uploadedByEmail: uploadedByEmail || "",
      totalRows: totalRows || 0,
      errorRows: errorRows || 0,
      created: created || 0,
      updated: updated || 0,
      skippedClaimed: skippedClaimed || 0,
      createdAt: new Date(),
    });
    return ref.id;
  }

  async function listImports(limit = 20) {
    const size = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const snap = await importsCol().orderBy("createdAt", "desc").limit(size).get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  return {
    findByRegistrationNumber,
    applyImport,
    claim,
    release,
    create,
    update,
    remove,
    list,
    stats,
    recordImport,
    listImports,
  };
}

module.exports = createAlumniRosterService();
module.exports.createAlumniRosterService = createAlumniRosterService;
