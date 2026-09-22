const test = require("node:test");
const assert = require("node:assert/strict");
const { createAlumniRosterController } = require("../src/controllers/alumniRosterController");
const { createAlumniRosterService } = require("../src/services/alumniRosterService");
const { parseRosterFile } = require("../src/utils/rosterFile");
const { FakeFirestore } = require("../testHelpers/fakeFirestore");

const HEADER = "registrationNumber,fullName,department,program,graduationYear,email";

function fakeRes() {
  const res = { statusCode: 200, headers: {}, body: undefined };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.send = (body) => { res.body = body; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  return res;
}
const csvFile = (text, name = "roster.csv") => ({ buffer: Buffer.from(text), originalname: name });

function setup({ approvalResult = { approved: 0 } } = {}) {
  const db = new FakeFirestore();
  const roster = createAlumniRosterService(() => db);
  let approvalCalls = 0;
  const approval = { autoApprovePending: async () => { approvalCalls += 1; return approvalResult; } };
  const controller = createAlumniRosterController({ roster, approval });
  return { db, roster, controller, approvalCalls: () => approvalCalls };
}
const admin = { userId: "admin-1", email: "admin@example.com" };

test("a dry run previews the import and saves nothing", async () => {
  const { db, controller, approvalCalls } = setup();
  const res = fakeRes();
  await controller.importRoster({ query: { dryRun: "true" }, file: csvFile(`${HEADER}\nBIT/24/BT/NE/001,Ada,,,,\nBIT/24/BT/ME/002,Bob,,,,\nbad,Row,,,,`), user: admin }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.dryRun, true);
  assert.deepEqual(res.body.summary, { created: 2, updated: 0, skippedClaimed: 0 });
  assert.equal(res.body.errorRows, 1);
  assert.equal(res.body.errors[0].row, 4);
  assert.equal(res.body.autoApproval, null);
  assert.equal(db.data.size, 0);
  assert.equal(approvalCalls(), 0);
});

test("a real import saves valid rows, records history and re-checks pending alumni", async () => {
  const { db, roster, controller, approvalCalls } = setup({ approvalResult: { approved: 2 } });
  const res = fakeRes();
  await controller.importRoster({ query: {}, file: csvFile(`${HEADER}\nBIT/24/BT/NE/001,Ada,,,,\nbad,Row,,,,`, "alumni.csv"), user: admin }, res);
  assert.equal(res.body.success, true);
  assert.equal(res.body.summary.created, 1);
  assert.equal(res.body.errorRows, 1);
  assert.deepEqual(res.body.autoApproval, { approved: 2 });
  assert.equal(approvalCalls(), 1);
  assert.equal(db.data.has("alumniRoster/BIT-24-BT-NE-001"), true);
  const history = await roster.listImports();
  assert.equal(history[0].fileName, "alumni.csv");
  assert.equal(history[0].uploadedBy, "admin-1");
  assert.equal(history[0].created, 1);
});

test("an approval failure after a successful import is reported, not thrown", async () => {
  const db = new FakeFirestore();
  const roster = createAlumniRosterService(() => db);
  const controller = createAlumniRosterController({ roster, approval: { autoApprovePending: async () => { throw new Error("boom"); } } });
  const res = fakeRes();
  const original = console.error; console.error = () => {};
  try {
    await controller.importRoster({ query: {}, file: csvFile(`${HEADER}\nBIT/24/BT/NE/001,Ada,,,,`), user: admin }, res);
  } finally { console.error = original; }
  assert.equal(res.body.success, true);
  assert.equal(res.body.autoApproval.failed, true);
  assert.equal(db.data.size > 0, true);
});

test("import rejects a missing file, wrong file type, missing columns and files with no valid rows", async () => {
  const { controller } = setup();
  await assert.rejects(controller.importRoster({ query: {}, file: undefined }, fakeRes()), /No file was uploaded/);
  await assert.rejects(controller.importRoster({ query: {}, file: csvFile("x", "notes.txt") }, fakeRes()), /Only \.csv and \.xlsx/);

  let res = fakeRes();
  await controller.importRoster({ query: {}, file: csvFile("name,program\nAda,BSc") }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /registrationNumber/);

  res = fakeRes();
  await controller.importRoster({ query: {}, file: csvFile(`${HEADER}\nbad,Row,,,,`) }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /None of the rows/);

  res = fakeRes();
  await controller.importRoster({ query: {}, file: csvFile(`${HEADER}\n`) }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /no data rows/);
});

test("create, get, update and delete a single entry", async () => {
  const { controller } = setup();
  let res = fakeRes();
  await controller.create({ body: { registrationNumber: "QAT/24/BT/NE/900", fullName: "QA Person", email: "QA@Example.com" } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.entry._id, "QAT-24-BT-NE-900");
  assert.equal(res.body.entry.email, "qa@example.com");
  assert.equal(typeof res.body.entry.createdAt, "string"); // serialised to ISO

  res = fakeRes();
  await controller.create({ body: { registrationNumber: "qat-24-bt-ne-900", fullName: "Again" } }, res);
  assert.equal(res.statusCode, 409);

  res = fakeRes();
  await controller.create({ body: { registrationNumber: "nope", fullName: "Bad" } }, res);
  assert.equal(res.statusCode, 400);

  res = fakeRes();
  await controller.getOne({ params: { id: "QAT-24-BT-NE-900" } }, res);
  assert.equal(res.body.entry.fullName, "QA Person");

  res = fakeRes();
  await controller.update({ params: { id: "QAT-24-BT-NE-900" }, body: { fullName: "QA Person (edited)" } }, res);
  assert.equal(res.body.entry.fullName, "QA Person (edited)");

  res = fakeRes();
  await controller.remove({ params: { id: "QAT-24-BT-NE-900" } }, res);
  assert.equal(res.statusCode, 200);
  res = fakeRes();
  await controller.remove({ params: { id: "QAT-24-BT-NE-900" } }, res);
  assert.equal(res.statusCode, 404);
  res = fakeRes();
  await controller.getOne({ params: { id: "QAT-24-BT-NE-900" } }, res);
  assert.equal(res.statusCode, 404);
});

test("a claimed entry cannot be deleted until an admin releases it", async () => {
  const { roster, controller } = setup();
  await roster.applyImport([{ registrationNumber: "BIT/24/BT/NE/001", fullName: "Ada" }]);
  await roster.claim("BIT/24/BT/NE/001", "user-1");

  let res = fakeRes();
  await controller.remove({ params: { id: "BIT-24-BT-NE-001" } }, res);
  assert.equal(res.statusCode, 409);

  res = fakeRes();
  await controller.release({ params: { id: "BIT-24-BT-NE-001" }, user: admin }, res);
  assert.equal(res.statusCode, 200);

  res = fakeRes();
  await controller.remove({ params: { id: "BIT-24-BT-NE-001" } }, res);
  assert.equal(res.statusCode, 200);
});

test("list, stats and history return serialised data", async () => {
  const { roster, controller } = setup();
  await roster.applyImport([1, 2, 3].map((n) => ({ registrationNumber: `BIT/24/BT/NE/00${n}`, fullName: `P${n}` })));
  await roster.claim("BIT/24/BT/NE/001", "u1");

  let res = fakeRes();
  await controller.list({ query: { limit: "2" } }, res);
  assert.equal(res.body.entries.length, 2);
  assert.equal(res.body.nextCursor, "BIT-24-BT-NE-002");
  assert.equal(res.body.entries[0]._id, "BIT-24-BT-NE-001");

  res = fakeRes();
  await controller.list({ query: { q: "bit/24", status: "claimed" } }, res);
  assert.deepEqual(res.body.entries.map((e) => e.id), ["BIT-24-BT-NE-001"]);

  res = fakeRes();
  await controller.stats({}, res);
  assert.deepEqual(res.body.stats, { total: 3, unclaimed: 2, claimed: 1 });

  res = fakeRes();
  await controller.history({ query: {} }, res);
  assert.deepEqual(res.body.imports, []);
});

test("the template is a CSV download with the header row", () => {
  const { controller } = setup();
  const res = fakeRes();
  controller.template({}, res);
  assert.match(res.headers["Content-Type"], /text\/csv/);
  assert.match(res.headers["Content-Disposition"], /alumni-roster-template\.csv/);
  assert.equal(res.body.trim(), HEADER);
  // and the template itself is accepted by the parser as a header (no data rows)
  return parseRosterFile({ buffer: Buffer.from(res.body), fileName: "t.csv" }).then((parsed) => {
    assert.deepEqual(parsed.headerErrors, []);
    assert.equal(parsed.totalRows, 0);
  });
});

test("re-check pending returns the approval summary", async () => {
  const { controller } = setup({ approvalResult: { checked: 4, approved: 3 } });
  const res = fakeRes();
  await controller.recheck({}, res);
  assert.deepEqual(res.body, { success: true, result: { checked: 4, approved: 3 } });
});
