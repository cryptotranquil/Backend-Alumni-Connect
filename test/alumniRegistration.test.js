const test = require("node:test");
const assert = require("node:assert/strict");
const {
  checkRegistrationNumber,
  decideAlumniRegistration,
  undoClaim,
  releaseForDeletedUser,
} = require("../src/services/alumniRegistration");
const { createAlumniRosterService } = require("../src/services/alumniRosterService");
const { FakeFirestore } = require("../testHelpers/fakeFirestore");

// Real Firestore runs transactions one after another when they touch the same
// document. The shared fake does not, so serialise them here to test races.
class SerialFirestore extends FakeFirestore {
  constructor() {
    super();
    this.tail = Promise.resolve();
  }
  runTransaction(fn) {
    const run = this.tail.then(() => super.runTransaction(fn));
    this.tail = run.catch(() => {});
    return run;
  }
}

const rec = (number, name) => ({
  registrationNumber: number, fullName: name, department: "", program: "", graduationYear: "", email: "",
});

async function setup() {
  const db = new SerialFirestore();
  const roster = createAlumniRosterService(() => db);
  await roster.applyImport([
    rec("BIT/24/BT/ME/009", "Chikondi Banda"),
    rec("BIT/23/BT/NE/004", "Tamanda Phiri"),
  ]);
  return { db, roster };
}
const stored = (db, id) => db.data.get(`alumniRoster/${id}`);

test("checkRegistrationNumber: required, then format, then normalised", () => {
  assert.equal(checkRegistrationNumber("").ok, false);
  assert.match(checkRegistrationNumber(undefined).message, /required for alumni/);
  assert.match(checkRegistrationNumber("BSE/20/001").message, /BIT\/24\/BT\/ME\/009/);
  assert.deepEqual(checkRegistrationNumber(" bit/24/bt/me/9 "), {
    ok: true,
    registrationNumber: "BIT/24/BT/ME/009",
  });
});

test("a number on the roster activates the account and claims the entry", async () => {
  const { db, roster } = await setup();
  const decision = await decideAlumniRegistration({ registrationNumber: "bit/24/bt/me/9", userId: "user-1", roster });
  assert.deepEqual(decision, {
    ok: true,
    registrationNumber: "BIT/24/BT/ME/009",
    accountStatus: "active",
    approvalSource: "roster",
    claimed: true,
  });
  assert.equal(stored(db, "BIT-24-BT-ME-009").status, "claimed");
  assert.equal(stored(db, "BIT-24-BT-ME-009").claimedBy, "user-1");
});

test("a number that is not on the roster becomes a pending account and writes nothing", async () => {
  const { db, roster } = await setup();
  const before = structuredClone([...db.data]);
  const decision = await decideAlumniRegistration({ registrationNumber: "BIT/22/BT/NE/999", userId: "user-2", roster });
  assert.equal(decision.accountStatus, "pending");
  assert.equal(decision.approvalSource, null);
  assert.equal(decision.claimed, false);
  assert.equal(decision.reason, "not_on_roster");
  assert.deepEqual([...db.data], before);
});

test("an entry already held by someone else is never taken over", async () => {
  const { db, roster } = await setup();
  await decideAlumniRegistration({ registrationNumber: "BIT/24/BT/ME/009", userId: "user-1", roster });
  const second = await decideAlumniRegistration({ registrationNumber: "BIT/24/BT/ME/009", userId: "user-2", roster });
  assert.equal(second.accountStatus, "pending");
  assert.equal(second.reason, "already_claimed");
  assert.equal(second.claimed, false);
  assert.equal(stored(db, "BIT-24-BT-ME-009").claimedBy, "user-1");
});

test("bad input is refused before the roster is touched", async () => {
  const { db, roster } = await setup();
  const before = structuredClone([...db.data]);
  for (const value of ["", undefined, "BSE/20/001", "garbage"]) {
    const decision = await decideAlumniRegistration({ registrationNumber: value, userId: "u", roster });
    assert.equal(decision.ok, false, JSON.stringify(value));
  }
  assert.deepEqual([...db.data], before);
});

test("simultaneous registrations with one number: exactly one is activated", async () => {
  const { roster } = await setup();
  const decisions = await Promise.all(
    ["a", "b", "c", "d", "e"].map((userId) =>
      decideAlumniRegistration({ registrationNumber: "BIT/24/BT/ME/009", userId, roster }),
    ),
  );
  assert.equal(decisions.filter((d) => d.accountStatus === "active").length, 1);
  assert.equal(decisions.filter((d) => d.accountStatus === "pending").length, 4);
});

test("undoClaim gives the entry back, but only for the account that holds it", async () => {
  const { db, roster } = await setup();
  await decideAlumniRegistration({ registrationNumber: "BIT/24/BT/ME/009", userId: "user-1", roster });

  const other = await undoClaim({ registrationNumber: "BIT/24/BT/ME/009", userId: "someone-else", roster });
  assert.equal(other.ok, false);
  assert.equal(stored(db, "BIT-24-BT-ME-009").status, "claimed");

  assert.equal((await undoClaim({ registrationNumber: "BIT/24/BT/ME/009", userId: "user-1", roster })).ok, true);
  assert.equal(stored(db, "BIT-24-BT-ME-009").status, "unclaimed");

  const again = await decideAlumniRegistration({ registrationNumber: "BIT/24/BT/ME/009", userId: "user-3", roster });
  assert.equal(again.accountStatus, "active");
});

test("undoClaim never throws, even if the database does", async () => {
  const broken = { release: async () => { throw new Error("db down"); } };
  const originalError = console.error;
  console.error = () => {};
  try {
    const result = await undoClaim({ registrationNumber: "BIT/24/BT/ME/009", userId: "u", roster: broken });
    assert.equal(result.ok, false);
  } finally {
    console.error = originalError;
  }
});

test("deleting an alumnus frees their roster entry; other roles and blank numbers are ignored", async () => {
  const { db, roster } = await setup();
  await decideAlumniRegistration({ registrationNumber: "BIT/24/BT/ME/009", userId: "user-1", roster });

  assert.equal(await releaseForDeletedUser({ id: "s1", role: "student", registrationNumber: "BIT/24/BT/ME/009" }, roster), null);
  assert.equal(await releaseForDeletedUser({ id: "user-9", role: "alumni", registrationNumber: "" }, roster), null);
  assert.equal(await releaseForDeletedUser(null, roster), null);
  assert.equal(stored(db, "BIT-24-BT-ME-009").status, "claimed");

  const result = await releaseForDeletedUser({ id: "user-1", role: "alumni", registrationNumber: "BIT/24/BT/ME/009" }, roster);
  assert.equal(result.ok, true);
  assert.equal(stored(db, "BIT-24-BT-ME-009").status, "unclaimed");
});

/* ---- how a pending registration meets the step 2 approval-after-import ---- */

test("a pending alumnus is approved automatically once an import adds their number", async () => {
  const { createRosterApprovalService } = require("../src/services/rosterApproval.service");
  const { db, roster } = await setup();

  // 1. Registers with a number that is not on the roster yet -> pending, nothing claimed.
  const decision = await decideAlumniRegistration({ registrationNumber: "bit-20-bt-ne-12", userId: "late-1", roster });
  assert.equal(decision.accountStatus, "pending");
  const users = [
    { id: "late-1", role: "alumni", accountStatus: "pending", registrationNumber: decision.registrationNumber, firstname: "Late", lastname: "One" },
  ];

  // 2. An admin uploads a fuller list that now contains them.
  await roster.applyImport([rec("BIT/20/BT/NE/012", "Late One")]);

  // 3. The post-import check approves and claims them, and records why.
  const notified = [];
  const approval = createRosterApprovalService({
    roster,
    users: {
      listUsers: async () => users,
      updateUser: async (id, patch) => Object.assign(users.find((u) => u.id === id), patch),
    },
    notifications: { notifyAlumniApproved: async (user) => notified.push(user.id) },
  });
  const summary = await approval.autoApprovePending();

  assert.equal(summary.approved, 1);
  assert.equal(users[0].accountStatus, "active");
  assert.equal(users[0].approvalSource, "roster");
  assert.equal(stored(db, "BIT-20-BT-NE-012").claimedBy, "late-1");
  assert.deepEqual(notified, ["late-1"]);
});
