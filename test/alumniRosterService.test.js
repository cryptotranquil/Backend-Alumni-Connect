const test = require("node:test");
const assert = require("node:assert/strict");
const { createAlumniRosterService } = require("../src/services/alumniRosterService");
const { FakeFirestore } = require("../testHelpers/fakeFirestore");

const make = () => {
  const db = new FakeFirestore();
  return { db, roster: createAlumniRosterService(() => db) };
};
const rec = (number, name = "Test Person", extra = {}) => ({
  registrationNumber: number, fullName: name, department: "", program: "", graduationYear: "", email: "", ...extra,
});

test("import creates unclaimed entries keyed by the number, with the parts split out", async () => {
  const { db, roster } = make();
  const result = await roster.applyImport([rec("BIT/24/BT/ME/009", "Ada", { email: "ADA@example.com" })], { batchId: "b1" });
  assert.deepEqual([result.created, result.updated, result.skippedClaimed], [1, 0, 0]);

  const stored = db.data.get("alumniRoster/BIT-24-BT-ME-009");
  assert.equal(stored.registrationNumber, "BIT/24/BT/ME/009");
  assert.equal(stored.email, "ada@example.com");
  assert.equal(stored.status, "unclaimed");
  assert.equal(stored.claimedBy, null);
  assert.equal(stored.admissionYear, "2024");
  assert.equal(stored.programCode, "BIT");
  assert.equal(stored.locationCode, "BT");
  assert.equal(stored.entryType, "ME");
  assert.equal(stored.importBatchId, "b1");
});

test("a dry run reports counts and writes nothing", async () => {
  const { db, roster } = make();
  const result = await roster.applyImport([rec("BIT/24/BT/ME/001"), rec("BIT/24/BT/ME/002")], { dryRun: true });
  assert.equal(result.created, 2);
  assert.equal(db.data.size, 0);
});

test("re-importing updates unclaimed entries and never touches claimed ones", async () => {
  const { db, roster } = make();
  await roster.applyImport([rec("BIT/24/BT/ME/001", "Old Name"), rec("BIT/24/BT/ME/002", "Second")]);
  await roster.claim("BIT/24/BT/ME/002", "user-2");

  const result = await roster.applyImport([
    rec("BIT/24/BT/ME/001", "New Name"),
    rec("BIT/24/BT/ME/002", "Should Not Overwrite"),
    rec("BIT/24/BT/ME/003", "Third"),
  ]);
  assert.deepEqual([result.created, result.updated, result.skippedClaimed], [1, 1, 1]);
  assert.equal(db.data.get("alumniRoster/BIT-24-BT-ME-001").fullName, "New Name");
  assert.equal(db.data.get("alumniRoster/BIT-24-BT-ME-002").fullName, "Second");
  assert.equal(db.data.get("alumniRoster/BIT-24-BT-ME-002").claimedBy, "user-2");
});

test("large imports are written in batches of at most 400", async () => {
  const { db, roster } = make();
  const records = Array.from({ length: 1000 }, (_, i) => rec(`BIT/24/BT/ME/${String(i + 1).padStart(4, "0")}`));
  const result = await roster.applyImport(records);
  assert.equal(result.created, 1000);
  assert.equal(db.data.size, 1000);
  assert.equal(db.batchesCommitted, 3);
});

test("a number is found however it is typed, and unknown or malformed numbers are not", async () => {
  const { roster } = make();
  await roster.applyImport([rec("BIT/24/BT/ME/009", "Ada")]);
  assert.equal((await roster.findByRegistrationNumber("bit-24-bt-me-9")).fullName, "Ada");
  assert.equal(await roster.findByRegistrationNumber("BIT/24/BT/ME/010"), null);
  assert.equal(await roster.findByRegistrationNumber("garbage"), null);
});

test("claim succeeds once, then reports already_claimed; unknown numbers are not_found", async () => {
  const { roster } = make();
  await roster.applyImport([rec("BIT/24/BT/ME/009")]);
  const first = await roster.claim("bit/24/bt/me/9", "user-1");
  assert.equal(first.ok, true);
  assert.equal(first.entry.claimedBy, "user-1");
  assert.deepEqual(await roster.claim("BIT/24/BT/ME/009", "user-2"), { ok: false, reason: "already_claimed" });
  assert.deepEqual(await roster.claim("BIT/24/BT/ME/777", "user-2"), { ok: false, reason: "not_found" });
  assert.deepEqual(await roster.claim("nonsense", "user-2"), { ok: false, reason: "not_found" });
});

test("only the claimant can release a claim, and the entry can then be claimed again", async () => {
  const { roster } = make();
  await roster.applyImport([rec("BIT/24/BT/ME/009")]);
  await roster.claim("BIT/24/BT/ME/009", "user-1");
  assert.deepEqual(await roster.release("BIT/24/BT/ME/009", "someone-else"), { ok: false, reason: "not_claimant" });
  assert.deepEqual(await roster.release("BIT/24/BT/ME/009", "user-1"), { ok: true });
  assert.equal((await roster.claim("BIT/24/BT/ME/009", "user-3")).ok, true);
});

test("create adds one entry and refuses duplicates and invalid numbers", async () => {
  const { roster } = make();
  assert.equal((await roster.create(rec("BIT/24/BT/ME/9", "Manual"))).ok, true);
  assert.deepEqual(await roster.create(rec("BIT/24/BT/ME/009")), { ok: false, reason: "exists" });
  assert.deepEqual(await roster.create(rec("nope")), { ok: false, reason: "invalid_number" });
});

test("update changes descriptive fields only", async () => {
  const { db, roster } = make();
  await roster.applyImport([rec("BIT/24/BT/ME/009", "Ada")]);
  const out = await roster.update("BIT/24/BT/ME/009", { fullName: "Ada L.", status: "claimed", registrationNumber: "X/99/XX/XX/999" });
  assert.equal(out.ok, true);
  const stored = db.data.get("alumniRoster/BIT-24-BT-ME-009");
  assert.equal(stored.fullName, "Ada L.");
  assert.equal(stored.status, "unclaimed");
  assert.equal(stored.registrationNumber, "BIT/24/BT/ME/009");
  assert.deepEqual(await roster.update("BIT/24/BT/ME/500", { fullName: "x" }), { ok: false, reason: "not_found" });
});

test("remove deletes unclaimed entries but refuses claimed ones", async () => {
  const { db, roster } = make();
  await roster.applyImport([rec("BIT/24/BT/ME/001"), rec("BIT/24/BT/ME/002")]);
  await roster.claim("BIT/24/BT/ME/002", "user-1");
  assert.deepEqual(await roster.remove("BIT/24/BT/ME/001"), { ok: true });
  assert.deepEqual(await roster.remove("BIT/24/BT/ME/002"), { ok: false, reason: "claimed" });
  assert.deepEqual(await roster.remove("BIT/24/BT/ME/001"), { ok: false, reason: "not_found" });
  assert.equal(db.data.has("alumniRoster/BIT-24-BT-ME-002"), true);
});

test("list pages through entries in order and returns a cursor", async () => {
  const { roster } = make();
  await roster.applyImport(Array.from({ length: 5 }, (_, i) => rec(`BIT/24/BT/ME/${String(i + 1).padStart(3, "0")}`)));
  const first = await roster.list({ limit: 2 });
  assert.deepEqual(first.entries.map((e) => e.id), ["BIT-24-BT-ME-001", "BIT-24-BT-ME-002"]);
  assert.equal(first.nextCursor, "BIT-24-BT-ME-002");
  const second = await roster.list({ limit: 2, after: first.nextCursor });
  assert.deepEqual(second.entries.map((e) => e.id), ["BIT-24-BT-ME-003", "BIT-24-BT-ME-004"]);
  const last = await roster.list({ limit: 2, after: second.nextCursor });
  assert.deepEqual(last.entries.map((e) => e.id), ["BIT-24-BT-ME-005"]);
  assert.equal(last.nextCursor, null);
});

test("list supports a number prefix and a status filter", async () => {
  const { roster } = make();
  await roster.applyImport([rec("BIT/24/BT/ME/001"), rec("BIT/24/BT/ME/002"), rec("BSE/16/LL/ME/001"), rec("BIT/23/LL/ME/001")]);
  await roster.claim("BIT/24/BT/ME/002", "user-1");

  assert.deepEqual((await roster.list({ prefix: "bit/24" })).entries.map((e) => e.id), ["BIT-24-BT-ME-001", "BIT-24-BT-ME-002"]);
  assert.deepEqual((await roster.list({ prefix: "BIT", status: "claimed" })).entries.map((e) => e.id), ["BIT-24-BT-ME-002"]);
  assert.equal((await roster.list({ status: "unclaimed" })).entries.length, 3);
  assert.equal((await roster.list({ status: "claimed" })).entries.length, 1);
});

test("stats returns totals", async () => {
  const { roster } = make();
  await roster.applyImport([rec("BIT/24/BT/ME/001"), rec("BIT/24/BT/ME/002"), rec("BIT/24/BT/ME/003")]);
  await roster.claim("BIT/24/BT/ME/001", "user-1");
  assert.deepEqual(await roster.stats(), { total: 3, unclaimed: 2, claimed: 1 });
});

test("import history is recorded and listed newest first", async () => {
  const { roster } = make();
  await roster.recordImport({ batchId: "b1", fileName: "one.csv", uploadedBy: "admin-1", totalRows: 3, created: 3 });
  await new Promise((resolve) => setTimeout(resolve, 5));
  await roster.recordImport({ batchId: "b2", fileName: "two.csv", uploadedBy: "admin-1", totalRows: 1, updated: 1 });
  const history = await roster.listImports();
  assert.deepEqual(history.map((h) => h.id), ["b2", "b1"]);
  assert.equal(history[1].fileName, "one.csv");
});

test("an admin can force-release a claim that belongs to someone else", async () => {
  const { roster } = make();
  await roster.applyImport([rec("BIT/24/BT/NE/009")]);
  await roster.claim("BIT/24/BT/NE/009", "user-1");
  assert.deepEqual(await roster.release("BIT/24/BT/NE/009", "admin-1"), { ok: false, reason: "not_claimant" });
  assert.deepEqual(await roster.release("BIT/24/BT/NE/009", "admin-1", { force: true }), { ok: true });
  assert.equal((await roster.findByRegistrationNumber("BIT/24/BT/NE/009")).status, "unclaimed");
});

test("a number added by someone else between preview and save is not overwritten", async () => {
  const { db, roster } = make();
  // The preview saw the number as new...
  const originalBatch = db.batch.bind(db);
  let injected = false;
  db.batch = () => {
    if (!injected) {
      injected = true;
      // ...but before the save, another admin adds it.
      db.data.set("alumniRoster/BIT-24-BT-NE-001", { fullName: "Added by someone else", status: "unclaimed" });
    }
    return originalBatch();
  };
  await assert.rejects(roster.applyImport([rec("BIT/24/BT/NE/001", "From the file")]), (error) => {
    assert.equal(error.status, 409);
    assert.match(error.message, /changed while the import/);
    return true;
  });
  assert.equal(db.data.get("alumniRoster/BIT-24-BT-NE-001").fullName, "Added by someone else");
});
