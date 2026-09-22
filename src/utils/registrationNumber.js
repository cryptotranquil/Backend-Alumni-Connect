/**
 * Registration number helpers.
 *
 * Format:  PROGRAM/YY/CAMPUS/ENTRY/SEQ      e.g.  BIT/24/BT/ME/009
 *   PROGRAM  programme code (BIT = BSc Information Technology)
 *   YY       two-digit YEAR OF REGISTRATION (24 = 2024), not the graduation year
 *   CAMPUS   location code (BT = Blantyre)
 *   ENTRY    entry type (ME = Mature Entry)
 *   SEQ      number of students registered that year (009)
 *
 * If the institution ever changes the format, change PATTERN below (and the
 * examples in tests). Nothing else in the roster code hard-codes the shape.
 */

const PATTERN = /^([A-Z]{2,6})\/(\d{2})\/([A-Z]{2,3})\/([A-Z]{2,3})\/(\d{1,5})$/;

// Zero-width characters and byte-order marks often ride along on text pasted from Excel.
const INVISIBLE = /[\u200B-\u200D\uFEFF\u00A0]/g;

/**
 * Loose clean-up that never rejects: trim, upper-case, drop whitespace and
 * invisible characters, treat "\", "-" and "_" as "/" and collapse repeats.
 * Also used for partial input such as a search prefix ("BIT/24").
 */
function cleanRegistrationNumber(input) {
  return String(input ?? "")
    .replace(INVISIBLE, "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[\\\-_]+/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/^\/|\/$/g, "");
}

/**
 * Canonical form used as the roster key and stored on users. On top of
 * cleanRegistrationNumber it pads the sequence to at least three digits, so
 * "BIT/24/BT/ME/9" and "BIT/24/BT/ME/009" are the same person.
 */
function normalizeRegistrationNumber(input) {
  const cleaned = cleanRegistrationNumber(input);
  const match = PATTERN.exec(cleaned);
  if (!match) return cleaned;
  const [, program, year, campus, entry, seq] = match;
  const paddedSeq = String(parseInt(seq, 10)).padStart(3, "0");
  return `${program}/${year}/${campus}/${entry}/${paddedSeq}`;
}

function isValidRegistrationNumber(input) {
  return PATTERN.test(normalizeRegistrationNumber(input));
}

/** Splits a valid number into its parts, or returns null if the format is wrong. */
function parseRegistrationNumber(input) {
  const normalized = normalizeRegistrationNumber(input);
  const match = PATTERN.exec(normalized);
  if (!match) return null;
  const [, programCode, yy, locationCode, entryType, sequence] = match;
  return {
    normalized,
    programCode,
    admissionYear: String(2000 + parseInt(yy, 10)),
    locationCode,
    entryType,
    sequence,
  };
}

/**
 * Firestore document IDs cannot contain "/", so the roster uses the number
 * with "-" instead: "BIT/24/BT/ME/009" -> "BIT-24-BT-ME-009". This is
 * unambiguous because cleanRegistrationNumber turns every "-" into "/".
 */
function toDocId(input) {
  return normalizeRegistrationNumber(input).replace(/\//g, "-");
}

/** Same idea for a partial number typed into a search box. */
function toDocIdPrefix(input) {
  return cleanRegistrationNumber(input).replace(/\//g, "-");
}

module.exports = {
  PATTERN,
  FORMAT_EXAMPLE: "BIT/24/BT/ME/009",
  cleanRegistrationNumber,
  normalizeRegistrationNumber,
  isValidRegistrationNumber,
  parseRegistrationNumber,
  toDocId,
  toDocIdPrefix,
};
