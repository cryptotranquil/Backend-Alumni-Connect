/**
 * Reads an alumni roster file (.csv or .xlsx) and turns it into validated
 * records plus row-level errors. It never touches the database.
 *
 *   const { records, errors, headerErrors, totalRows } =
 *     await parseRosterFile({ buffer, fileName });
 *
 * CSV is parsed here (no dependency). XLSX needs the `exceljs` package, which
 * is loaded only when an .xlsx file is actually uploaded:  npm install exceljs
 */

const {
  FORMAT_EXAMPLE,
  normalizeRegistrationNumber,
  isValidRegistrationNumber,
} = require("./registrationNumber");

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_ROWS = 20000;
const MAX_REPORTED_ERRORS = 200; // all errors are counted, only this many are returned

class RosterFileError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "RosterFileError";
    this.status = status;
  }
}

// Header names are compared lower-cased with everything except letters and
// digits removed, so "Reg. No", "reg_no" and "REG NO" all become "regno".
const HEADER_ALIASES = {
  registrationNumber: ["registrationnumber", "registrationno", "registration", "regnumber", "regno", "regnum"],
  fullName: ["fullname", "name", "alumniname", "studentname"],
  department: ["department", "dept"],
  program: ["program", "programme", "course"],
  graduationYear: ["graduationyear", "gradyear", "yearofgraduation", "graduation"],
  email: ["email", "emailaddress", "mail"],
};
const REQUIRED_FIELDS = ["registrationNumber", "fullName"];

const headerKey = (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * CSV files saved by Excel on Windows are often Windows-1252, not UTF-8.
 * Try strict UTF-8 first and fall back to Windows-1252 so accents survive.
 */
function decodeCsvBuffer(buffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch (error) {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

// Control characters (except tab/newline) have no place in names or numbers.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Minimal RFC 4180 CSV reader: quotes, escaped quotes, commas/newlines inside quotes, CRLF. */
function parseCsv(text) {
  let input = String(text ?? "").replace(/^\uFEFF/, ""); // Excel adds a byte-order mark
  const firstLine = input.split(/\r\n|\n|\r/, 1)[0] || "";
  const count = (ch) => firstLine.split(ch).length - 1;
  // Other Excel locales save semicolon- or tab-separated "CSV"; pick whichever the header uses most.
  const delimiter = [",", ";", "\t"].reduce((best, ch) => (count(ch) > count(best) ? ch : best), ",");

  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') { field += '"'; i += 1; } else { inQuotes = false; }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === "") {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field); field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i += 1;
      row.push(field); rows.push(row); row = []; field = "";
    } else {
      field += ch;
    }
  }
  if (inQuotes) throw new RosterFileError("The CSV file has an unclosed quote. Check the file and try again.");
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

/** Reads the "Roster" sheet (or the first sheet) of an .xlsx file as rows of text. */
async function readXlsx(buffer) {
  let ExcelJS;
  try {
    ExcelJS = require("exceljs");
  } catch (error) {
    throw new RosterFileError("Excel import is not installed on the server. Run: npm install exceljs", 500);
  }
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch (error) {
    throw new RosterFileError("That file could not be read as an .xlsx workbook.");
  }
  const sheet = workbook.getWorksheet("Roster") || workbook.worksheets[0];
  if (!sheet) throw new RosterFileError("The workbook has no sheets.");
  const columns = sheet.columnCount;
  const rows = [];
  for (let r = 1; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    const values = [];
    for (let c = 1; c <= columns; c += 1) values.push(row.getCell(c).text ?? "");
    rows.push(values);
  }
  return rows;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Turns rows of text (first non-empty row = header) into records and errors. */
function rowsToRecords(matrix, { now = new Date() } = {}) {
  const result = { records: [], errors: [], errorCount: 0, headerErrors: [], totalRows: 0 };

  const headerIndex = matrix.findIndex((row) => row.some((cell) => String(cell ?? "").trim() !== ""));
  if (headerIndex === -1) {
    result.headerErrors.push("The file is empty.");
    return result;
  }

  const columnFor = {};
  matrix[headerIndex].forEach((cell, index) => {
    const key = headerKey(cell);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(key) && columnFor[field] === undefined) columnFor[field] = index;
    }
  });
  for (const field of REQUIRED_FIELDS) {
    if (columnFor[field] === undefined) {
      result.headerErrors.push(`Missing required column "${field}". Use the header row from the template.`);
    }
  }
  if (result.headerErrors.length) return result;

  const cell = (row, field) =>
    columnFor[field] === undefined ? "" : String(row[columnFor[field]] ?? "").replace(CONTROL_CHARS, "").trim();
  const maxYear = now.getFullYear() + 1;
  const firstRowOf = new Map(); // normalized number -> row number, to flag duplicates

  for (let i = headerIndex + 1; i < matrix.length; i += 1) {
    const row = matrix[i];
    if (row.every((value) => String(value ?? "").trim() === "")) continue;

    result.totalRows += 1;
    if (result.totalRows > MAX_ROWS) {
      throw new RosterFileError(`The file has more than ${MAX_ROWS} rows. Split it into smaller files.`);
    }

    const rowNumber = i + 1;
    const problems = [];
    const rawNumber = cell(row, "registrationNumber");
    const registrationNumber = normalizeRegistrationNumber(rawNumber);
    const fullName = cell(row, "fullName").replace(/\s+/g, " ");
    const department = cell(row, "department");
    const program = cell(row, "program");
    // Excel sometimes writes a year as a number with a decimal part ("2020.0").
    const graduationYear = cell(row, "graduationYear").replace(/^(\d{4})\.0+$/, "$1");
    const email = cell(row, "email").toLowerCase();

    if (!rawNumber) problems.push("Missing registration number");
    else if (!isValidRegistrationNumber(rawNumber)) {
      problems.push(`Invalid registration number "${rawNumber}" (expected a format like ${FORMAT_EXAMPLE})`);
    }
    if (!fullName) problems.push("Missing full name");
    else if (fullName.length > 200) problems.push("Full name is longer than 200 characters");
    if (department.length > 200) problems.push("Department is longer than 200 characters");
    if (program.length > 200) problems.push("Program is longer than 200 characters");
    if (graduationYear) {
      const year = Number(graduationYear);
      if (!/^\d{4}$/.test(graduationYear) || year < 1960 || year > maxYear) {
        problems.push(`Graduation year "${graduationYear}" is not a valid four-digit year`);
      }
    }
    if (email && !EMAIL_PATTERN.test(email)) problems.push(`Email "${email}" is not valid`);

    if (!problems.length) {
      if (firstRowOf.has(registrationNumber)) {
        problems.push(`Duplicate of row ${firstRowOf.get(registrationNumber)} (${registrationNumber})`);
      } else {
        firstRowOf.set(registrationNumber, rowNumber);
      }
    }

    if (problems.length) {
      result.errorCount += 1;
      if (result.errors.length < MAX_REPORTED_ERRORS) {
        result.errors.push({ row: rowNumber, registrationNumber: rawNumber, problems });
      }
    } else {
      result.records.push({ row: rowNumber, registrationNumber, fullName, department, program, graduationYear, email });
    }
  }
  return result;
}

/** Entry point: validates the file type and size, reads it, and returns the parsed result. */
async function parseRosterFile({ buffer, fileName = "" }) {
  if (!buffer || !buffer.length) throw new RosterFileError("No file was uploaded.");
  if (buffer.length > MAX_FILE_BYTES) throw new RosterFileError("The file is larger than 5 MB.", 413);

  const lower = String(fileName).toLowerCase();
  let matrix;
  if (lower.endsWith(".csv")) {
    matrix = parseCsv(decodeCsvBuffer(buffer));
  } else if (lower.endsWith(".xlsx")) {
    matrix = await readXlsx(buffer);
  } else if (lower.endsWith(".xls")) {
    throw new RosterFileError("Old .xls files are not supported. Save the file as .xlsx or .csv and try again.");
  } else {
    throw new RosterFileError("Only .csv and .xlsx files are supported.");
  }
  return rowsToRecords(matrix);
}

module.exports = {
  MAX_FILE_BYTES,
  MAX_ROWS,
  MAX_REPORTED_ERRORS,
  RosterFileError,
  decodeCsvBuffer,
  parseCsv,
  rowsToRecords,
  parseRosterFile,
};
