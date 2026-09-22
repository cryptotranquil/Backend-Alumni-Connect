const { serialize } = require("../utils/serialize");
const { parseRosterFile, RosterFileError } = require("../utils/rosterFile");

const TEMPLATE_HEADER = "registrationNumber,fullName,department,program,graduationYear,email\r\n";

const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });
const view = (entry) => ({ ...serialize(entry), _id: entry.id });

/**
 * Handlers are built from dependencies so they can be unit-tested without
 * Express or Firebase. The default export at the bottom wires the real ones.
 */
function createAlumniRosterController(overrides = {}) {
  const roster = () => overrides.roster || require("../services/alumniRosterService");
  const approval = () => overrides.approval || require("../services/rosterApproval.service");
  const parse = overrides.parse || parseRosterFile;

  return {
    /** POST /import[?dryRun=true]  (multipart, field "file") */
    async importRoster(req, res) {
      const dryRun = String(req.query.dryRun).toLowerCase() === "true";
      if (!req.file) {
        throw new RosterFileError('No file was uploaded. Send it in a form field named "file".');
      }

      const parsed = await parse({ buffer: req.file.buffer, fileName: req.file.originalname });
      if (parsed.headerErrors.length) {
        return fail(res, 400, parsed.headerErrors[0], { headerErrors: parsed.headerErrors });
      }
      if (parsed.records.length === 0) {
        const message = parsed.totalRows ? "None of the rows in the file are valid." : "The file has no data rows.";
        return fail(res, 400, message, { totalRows: parsed.totalRows, errorRows: parsed.errorCount, errors: parsed.errors });
      }

      const result = await roster().applyImport(parsed.records, { dryRun });

      let autoApproval = null;
      if (!dryRun) {
        await roster().recordImport({
          batchId: result.batchId,
          fileName: req.file.originalname,
          uploadedBy: req.user?.userId,
          uploadedByEmail: req.user?.email,
          totalRows: parsed.totalRows,
          errorRows: parsed.errorCount,
          created: result.created,
          updated: result.updated,
          skippedClaimed: result.skippedClaimed,
        });
        try {
          autoApproval = await approval().autoApprovePending();
        } catch (error) {
          // The roster is already saved; report the problem instead of failing the import.
          console.error("[rosterImport] auto-approval step failed:", error);
          autoApproval = { failed: true, message: "The roster was saved, but re-checking pending alumni failed. Use Re-check pending alumni to retry." };
        }
      }

      return res.json({
        success: true,
        dryRun,
        fileName: req.file.originalname,
        batchId: dryRun ? null : result.batchId,
        totalRows: parsed.totalRows,
        validRows: parsed.records.length,
        errorRows: parsed.errorCount,
        errors: parsed.errors,
        summary: { created: result.created, updated: result.updated, skippedClaimed: result.skippedClaimed },
        autoApproval,
      });
    },

    /** GET /?status=&q=&limit=&after= */
    async list(req, res) {
      const { entries, nextCursor } = await roster().list({
        status: req.query.status || undefined,
        prefix: req.query.q || undefined,
        limit: req.query.limit,
        after: req.query.after || undefined,
      });
      return res.json({ success: true, entries: entries.map(view), nextCursor });
    },

    async stats(_req, res) {
      return res.json({ success: true, stats: await roster().stats() });
    },

    async history(req, res) {
      const imports = await roster().listImports(req.query.limit);
      return res.json({ success: true, imports: imports.map((item) => serialize(item)) });
    },

    async getOne(req, res) {
      const entry = await roster().findByRegistrationNumber(req.params.id);
      if (!entry) return fail(res, 404, "Roster entry not found");
      return res.json({ success: true, entry: view(entry) });
    },

    async create(req, res) {
      const result = await roster().create(req.body);
      if (!result.ok) {
        if (result.reason === "exists") return fail(res, 409, "That registration number is already in the roster.");
        return fail(res, 400, "Invalid registration number.");
      }
      return res.status(201).json({ success: true, entry: view(result.entry) });
    },

    async update(req, res) {
      const result = await roster().update(req.params.id, req.body);
      if (!result.ok) return fail(res, 404, "Roster entry not found");
      return res.json({ success: true, entry: view(result.entry) });
    },

    async remove(req, res) {
      const result = await roster().remove(req.params.id);
      if (!result.ok) {
        if (result.reason === "claimed") {
          return fail(res, 409, "This entry has been claimed by a registered user. Release the claim first.");
        }
        return fail(res, 404, "Roster entry not found");
      }
      return res.json({ success: true, message: "Roster entry deleted" });
    },

    /** POST /:id/release  (admin frees an entry another user claimed) */
    async release(req, res) {
      const result = await roster().release(req.params.id, req.user?.userId, { force: true });
      if (!result.ok) return fail(res, 404, "Roster entry not found");
      return res.json({ success: true, message: "Claim released. The user's own account is not changed." });
    },

    /** POST /recheck-pending */
    async recheck(_req, res) {
      return res.json({ success: true, result: await approval().autoApprovePending() });
    },

    /** GET /template */
    template(_req, res) {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="alumni-roster-template.csv"');
      return res.send(TEMPLATE_HEADER);
    },
  };
}

module.exports = createAlumniRosterController();
module.exports.createAlumniRosterController = createAlumniRosterController;
