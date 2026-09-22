/**
 * Decides what happens when an alumnus registers, based on the alumni roster
 * (services/alumniRosterService).
 *
 *   number on the roster and unclaimed -> account is ACTIVE straight away
 *                                         (approvalSource "roster")
 *   anything else                      -> account is PENDING until an admin
 *                                         approves it (approvalSource "manual"),
 *                                         or until an import adds the number and
 *                                         rosterApproval.service approves it
 *
 * The roster entry is claimed atomically *before* the user is created, so two
 * people registering with the same number cannot both be auto-approved. If
 * creating the user then fails, call undoClaim().
 */
const {
  parseRegistrationNumber,
  FORMAT_EXAMPLE,
} = require("../utils/registrationNumber");

// Loaded lazily so unit tests can pass a roster service built on a fake database.
const defaultRoster = () => require("./alumniRosterService");

/** Presence + format check. Returns { ok: true, registrationNumber } or { ok: false, message }. */
function checkRegistrationNumber(registrationNumber) {
  const text = String(registrationNumber ?? "").trim();
  if (!text) {
    return { ok: false, message: "Registration number is required for alumni." };
  }
  const parts = parseRegistrationNumber(text);
  if (!parts) {
    return {
      ok: false,
      message: `Registration number must look like ${FORMAT_EXAMPLE}.`,
    };
  }
  return { ok: true, registrationNumber: parts.normalized };
}

/**
 * @returns
 *   { ok: false, message }                                  - refuse the request (400)
 *   { ok: true, registrationNumber, accountStatus, approvalSource, claimed, reason? }
 */
async function decideAlumniRegistration({ registrationNumber, userId, roster }) {
  const checked = checkRegistrationNumber(registrationNumber);
  if (!checked.ok) return checked;

  const claim = await (roster || defaultRoster()).claim(checked.registrationNumber, userId);

  if (claim.ok) {
    return {
      ok: true,
      registrationNumber: checked.registrationNumber,
      accountStatus: "active",
      approvalSource: "roster",
      claimed: true,
    };
  }

  // Not on the roster, or the entry is already held by another account
  // (for example the number was released incorrectly): an admin decides.
  return {
    ok: true,
    registrationNumber: checked.registrationNumber,
    accountStatus: "pending",
    approvalSource: null,
    claimed: false,
    reason: claim.reason === "not_found" ? "not_on_roster" : "already_claimed",
  };
}

/** Give the roster entry back after a failed registration. Never throws. */
async function undoClaim({ registrationNumber, userId, roster }) {
  try {
    return await (roster || defaultRoster()).release(registrationNumber, userId);
  } catch (error) {
    console.error("[roster] could not release claim:", error.message);
    return { ok: false, reason: "error" };
  }
}

/** Give the roster entry back when an admin deletes the account. Never throws. */
async function releaseForDeletedUser(user, roster) {
  if (!user || user.role !== "alumni" || !user.registrationNumber) return null;
  return undoClaim({
    registrationNumber: user.registrationNumber,
    userId: user.id,
    roster,
  });
}

module.exports = {
  checkRegistrationNumber,
  decideAlumniRegistration,
  undoClaim,
  releaseForDeletedUser,
};
