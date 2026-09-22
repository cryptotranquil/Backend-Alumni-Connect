/**
 * Approves pending alumni whose registration number is in the roster.
 *
 * Used after every roster import (so people who registered before their record
 * was uploaded get approved automatically) and by the "re-check" endpoint.
 * Only accounts with accountStatus === "pending" are touched; "disabled"
 * accounts are never re-enabled by this code.
 */

const { parseRegistrationNumber } = require("../utils/registrationNumber");

const MAX_LISTED = 50;

function createRosterApprovalService(overrides = {}) {
  // Loaded lazily so unit tests can inject fakes without Firebase credentials.
  const roster = () => overrides.roster || require("./alumniRosterService");
  const users = () => overrides.users || require("./userService");
  const notifications = () => overrides.notifications || require("./notification.service");

  async function autoApprovePending() {
    const summary = {
      checked: 0,
      approved: 0,
      notInRoster: 0,
      alreadyClaimed: 0,
      invalidNumber: 0,
      failed: 0,
      approvedUsers: [],
    };

    const pending = (await users().listUsers()).filter(
      (u) => u.role === "alumni" && u.accountStatus === "pending",
    );

    for (const user of pending) {
      summary.checked += 1;
      if (!user.registrationNumber || !parseRegistrationNumber(user.registrationNumber)) {
        summary.invalidNumber += 1;
        continue;
      }

      const claim = await roster().claim(user.registrationNumber, user.id);
      if (!claim.ok) {
        if (claim.reason === "already_claimed") summary.alreadyClaimed += 1;
        else summary.notInRoster += 1;
        continue;
      }

      try {
        await users().updateUser(user.id, { accountStatus: "active", approvalSource: "roster" });
      } catch (error) {
        // Give the roster entry back so the alumnus is not left half-approved.
        await roster().release(user.registrationNumber, user.id).catch(() => {});
        console.error(`[rosterApproval] could not activate ${user.id}:`, error.message);
        summary.failed += 1;
        continue;
      }

      summary.approved += 1;
      if (summary.approvedUsers.length < MAX_LISTED) {
        summary.approvedUsers.push({
          id: user.id,
          name: `${user.firstname || ""} ${user.lastname || ""}`.trim(),
          registrationNumber: claim.entry.registrationNumber,
        });
      }
      try {
        await notifications().notifyAlumniApproved({ ...user, accountStatus: "active" });
      } catch (error) {
        console.warn(`[rosterApproval] notification failed for ${user.id}:`, error.message);
      }
    }
    return summary;
  }

  return { autoApprovePending };
}

module.exports = createRosterApprovalService();
module.exports.createRosterApprovalService = createRosterApprovalService;
