const test = require("node:test");
const assert = require("node:assert/strict");
const { createAlumniRosterService } = require("../src/services/alumniRosterService");
const { createRosterApprovalService } = require("../src/services/rosterApproval.service");
const { FakeFirestore } = require("../testHelpers/fakeFirestore");

const rec = (number, name = "Roster Person") => ({ registrationNumber: number, fullName: name, department: "", program: "", graduationYear: "", email: "" });

function setup(userList) {
  const db = new FakeFirestore();
  const roster = createAlumniRosterService(() => db);
  const updates = [];
  const notified = [];
  const users = {
    listUsers: async () => userList,
    updateUser: async (id, patch) => {
      if (id === "boom") throw new Error("write failed");
      updates.push({ id, patch });
    },
  };
  const notifications = { notifyAlumniApproved: async (user) => notified.push(user.id) };
  const approval = createRosterApprovalService({ roster, users, notifications });
  return { roster, approval, updates, notified };
}

const alumnus = (id, registrationNumber, accountStatus = "pending", extra = {}) => ({
  id, role: "alumni", accountStatus, registrationNumber, firstname: "A", lastname: id, ...extra,
});

test("pending alumni in the roster are approved, claimed and notified", async () => {
  const { roster, approval, updates, notified } = setup([alumnus("u1", "bit-24-bt-ne-9")]);
  await roster.applyImport([rec("BIT/24/BT/NE/009")]);

  const result = await approval.autoApprovePending();
  assert.equal(result.approved, 1);
  assert.deepEqual(updates, [{ id: "u1", patch: { accountStatus: "active", approvalSource: "roster" } }]);
  assert.deepEqual(notified, ["u1"]);
  assert.equal(result.approvedUsers[0].registrationNumber, "BIT/24/BT/NE/009");
  const entry = await roster.findByRegistrationNumber("BIT/24/BT/NE/009");
  assert.equal(entry.status, "claimed");
  assert.equal(entry.claimedBy, "u1");
});

test("numbers missing from the roster stay pending", async () => {
  const { approval, updates } = setup([alumnus("u1", "BIT/24/BT/NE/010")]);
  const result = await approval.autoApprovePending();
  assert.deepEqual([result.checked, result.approved, result.notInRoster], [1, 0, 1]);
  assert.equal(updates.length, 0);
});

test("only pending alumni are considered: active, disabled, students and admins are ignored", async () => {
  const { roster, approval, updates } = setup([
    alumnus("active", "BIT/24/BT/NE/001", "active"),
    alumnus("disabled", "BIT/24/BT/NE/002", "disabled"),
    { id: "student", role: "student", accountStatus: "pending", registrationNumber: "BIT/24/BT/NE/003" },
    { id: "admin", role: "admin", accountStatus: "pending", registrationNumber: "BIT/24/BT/NE/004" },
  ]);
  await roster.applyImport([1, 2, 3, 4].map((n) => rec(`BIT/24/BT/NE/00${n}`)));
  const result = await approval.autoApprovePending();
  assert.equal(result.checked, 0);
  assert.equal(updates.length, 0);
});

test("a roster entry can only approve one person", async () => {
  const { roster, approval } = setup([alumnus("u1", "BIT/24/BT/NE/009"), alumnus("u2", "BIT-24-BT-NE-009")]);
  await roster.applyImport([rec("BIT/24/BT/NE/009")]);
  const result = await approval.autoApprovePending();
  assert.deepEqual([result.approved, result.alreadyClaimed], [1, 1]);
});

test("missing or malformed registration numbers are counted, not crashed on", async () => {
  const { approval } = setup([alumnus("u1", ""), alumnus("u2", "12345"), alumnus("u3", undefined)]);
  const result = await approval.autoApprovePending();
  assert.equal(result.invalidNumber, 3);
  assert.equal(result.approved, 0);
});

test("if activating the user fails, the roster entry is given back", async () => {
  const { roster, approval } = setup([alumnus("boom", "BIT/24/BT/NE/009")]);
  await roster.applyImport([rec("BIT/24/BT/NE/009")]);
  const result = await approval.autoApprovePending();
  assert.deepEqual([result.approved, result.failed], [0, 1]);
  assert.equal((await roster.findByRegistrationNumber("BIT/24/BT/NE/009")).status, "unclaimed");
});

test("a failed notification does not undo the approval", async () => {
  const db = new FakeFirestore();
  const roster = createAlumniRosterService(() => db);
  const approval = createRosterApprovalService({
    roster,
    users: { listUsers: async () => [alumnus("u1", "BIT/24/BT/NE/009")], updateUser: async () => {} },
    notifications: { notifyAlumniApproved: async () => { throw new Error("mail down"); } },
  });
  await roster.applyImport([rec("BIT/24/BT/NE/009")]);
  const result = await approval.autoApprovePending();
  assert.equal(result.approved, 1);
});
