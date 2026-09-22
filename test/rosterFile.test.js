const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCsv, rowsToRecords, parseRosterFile, RosterFileError, MAX_ROWS } = require("../src/utils/rosterFile");

const HEADER = "registrationNumber,fullName,department,program,graduationYear,email";
const NOW = new Date("2026-09-20T00:00:00Z");

test("parseCsv handles quotes, commas and newlines inside quotes, CRLF and a BOM", () => {
  const text = '\uFEFFa,b,c\r\n1,"x, y","line1\nline2"\r\n"he said ""hi""",2,3\r\n';
  assert.deepEqual(parseCsv(text), [
    ["a", "b", "c"],
    ["1", "x, y", "line1\nline2"],
    ['he said "hi"', "2", "3"],
  ]);
});

test("parseCsv detects a semicolon-separated file (common Excel setting)", () => {
  assert.deepEqual(parseCsv("a;b\n1;2\n"), [["a", "b"], ["1", "2"]]);
});

test("parseCsv rejects an unclosed quote", () => {
  assert.throws(() => parseCsv('a,b\n"oops,1\n'), RosterFileError);
});

test("a clean file produces records with normalised numbers", () => {
  const csv = [
    HEADER,
    "bit/16/bt/me/9,Chikondi Banda,Information Technology,BSc Information Technology,2020,Chikondi@Example.com",
    "BSE/16/LL/ME/001,  Thoko   Phiri ,,,,",
  ].join("\n");
  const out = rowsToRecords(parseCsv(csv), { now: NOW });
  assert.equal(out.errors.length, 0);
  assert.equal(out.totalRows, 2);
  assert.deepEqual(out.records[0], {
    row: 2,
    registrationNumber: "BIT/16/BT/ME/009",
    fullName: "Chikondi Banda",
    department: "Information Technology",
    program: "BSc Information Technology",
    graduationYear: "2020",
    email: "chikondi@example.com",
  });
  assert.equal(out.records[1].fullName, "Thoko Phiri");
});

test("header names are matched flexibly and in any order", () => {
  const csv = "Full Name,Reg. No,Email Address\nAda Lovelace,BIT/24/BT/ME/009,ada@example.com";
  const out = rowsToRecords(parseCsv(csv), { now: NOW });
  assert.equal(out.errors.length, 0);
  assert.equal(out.records[0].registrationNumber, "BIT/24/BT/ME/009");
  assert.equal(out.records[0].fullName, "Ada Lovelace");
});

test("missing required columns are reported as header errors", () => {
  const out = rowsToRecords(parseCsv("fullName,program\nAda,BSc"), { now: NOW });
  assert.equal(out.records.length, 0);
  assert.match(out.headerErrors[0], /registrationNumber/);
});

test("bad rows are reported with their row number and the good rows still come through", () => {
  const csv = [
    HEADER,
    "BIT/24/BT/ME/001,Good Person,,,2020,",
    ",No Number,,,,",
    "12345,Bad Format,,,,",
    "BIT/24/BT/ME/002,,,,,",
    "BIT/24/BT/ME/003,Bad Year,,,20xx,",
    "BIT/24/BT/ME/004,Bad Email,,,,not-an-email",
    "BIT/24/BT/ME/1,Duplicate Of First,,,,",
  ].join("\n");
  const out = rowsToRecords(parseCsv(csv), { now: NOW });
  assert.deepEqual(out.records.map((r) => r.row), [2]);
  assert.deepEqual(out.errors.map((e) => e.row), [3, 4, 5, 6, 7, 8]);
  assert.match(out.errors[0].problems[0], /Missing registration number/);
  assert.match(out.errors[1].problems[0], /Invalid registration number/);
  assert.match(out.errors[2].problems[0], /Missing full name/);
  assert.match(out.errors[3].problems[0], /Graduation year/);
  assert.match(out.errors[4].problems[0], /Email/);
  assert.match(out.errors[5].problems[0], /Duplicate of row 2/);
});

test("blank rows are skipped but row numbers stay true to the file", () => {
  const csv = `${HEADER}\n\nBIT/24/BT/ME/001,A B,,,,\n,,,,,\nBIT/24/BT/ME/002,C D,,,,`;
  const out = rowsToRecords(parseCsv(csv), { now: NOW });
  assert.deepEqual(out.records.map((r) => r.row), [3, 5]);
  assert.equal(out.totalRows, 2);
});

test("an empty file is reported", () => {
  assert.match(rowsToRecords([], { now: NOW }).headerErrors[0], /empty/);
});

test("parseRosterFile checks file type, size and emptiness", async () => {
  await assert.rejects(parseRosterFile({ buffer: Buffer.from("x"), fileName: "roster.pdf" }), /Only \.csv and \.xlsx/);
  await assert.rejects(parseRosterFile({ buffer: Buffer.from("x"), fileName: "roster.xls" }), /Old \.xls/);
  await assert.rejects(parseRosterFile({ buffer: Buffer.alloc(0), fileName: "roster.csv" }), /No file/);
  await assert.rejects(parseRosterFile({ buffer: Buffer.alloc(5 * 1024 * 1024 + 1, "a"), fileName: "big.csv" }), /larger than 5 MB/);
  const ok = await parseRosterFile({ buffer: Buffer.from(`${HEADER}\nBIT/24/BT/ME/009,Ada,,,,`), fileName: "Roster.CSV" });
  assert.equal(ok.records.length, 1);
});

test("a file with too many rows is refused", () => {
  const matrix = [["registrationNumber", "fullName"]];
  for (let i = 0; i <= MAX_ROWS; i += 1) matrix.push([`BIT/24/BT/ME/${String(i).padStart(5, "0")}`, "X"]);
  assert.throws(() => rowsToRecords(matrix, { now: NOW }), /more than 20000 rows/);
});

test("a graduation year in the far future is rejected for an alumni roster", () => {
  const out = rowsToRecords(parseCsv(`${HEADER}\nBIT/24/BT/ME/001,Future Person,,,2030,`), { now: NOW });
  assert.equal(out.records.length, 0);
  assert.match(out.errors[0].problems[0], /Graduation year/);
});

test("Windows-1252 CSV files keep their accents, UTF-8 files are untouched", async () => {
  const { decodeCsvBuffer } = require("../src/utils/rosterFile");
  assert.equal(decodeCsvBuffer(Buffer.from([0x4a, 0x6f, 0x73, 0xe9])), "Jos\u00e9"); // "Jos" + 0xE9 in Windows-1252
  assert.equal(decodeCsvBuffer(Buffer.from("Jos\u00e9", "utf8")), "Jos\u00e9");
  const parsed = await parseRosterFile({
    buffer: Buffer.concat([Buffer.from(`${HEADER}\nBIT/24/BT/ME/009,Jos`), Buffer.from([0xe9]), Buffer.from(",,,,")]),
    fileName: "excel-export.csv",
  });
  assert.equal(parsed.records[0].fullName, "Jos\u00e9");
});

test("tab-separated files are detected", () => {
  assert.deepEqual(parseCsv("a\tb\tc\n1\t2\t3"), [["a", "b", "c"], ["1", "2", "3"]]);
});

test("a year Excel wrote as 2020.0 is accepted", () => {
  const out = rowsToRecords(parseCsv(`${HEADER}\nBIT/16/BT/NE/001,Ada,,,2020.0,`), { now: NOW });
  assert.equal(out.errors.length, 0);
  assert.equal(out.records[0].graduationYear, "2020");
});

test("control characters are removed from cells", () => {
  const out = rowsToRecords([["registrationNumber", "fullName"], ["BIT/16/BT/NE/001", "Ada\u0000 Love\u0007lace"]], { now: NOW });
  assert.equal(out.records[0].fullName, "Ada Lovelace");
});

test("only the first 200 errors are returned but all are counted", () => {
  const matrix = [["registrationNumber", "fullName"]];
  for (let i = 0; i < 250; i += 1) matrix.push(["bad-number", "Someone"]);
  const out = rowsToRecords(matrix, { now: NOW });
  assert.equal(out.errors.length, 200);
  assert.equal(out.errorCount, 250);
  assert.equal(out.records.length, 0);
});

test("NE and ME numbers both import", () => {
  const out = rowsToRecords(parseCsv(`${HEADER}\nBIT/16/BT/NE/001,A B,,,,\nBIT/16/BT/ME/001,C D,,,,`), { now: NOW });
  assert.deepEqual(out.records.map((r) => r.registrationNumber), ["BIT/16/BT/NE/001", "BIT/16/BT/ME/001"]);
});
