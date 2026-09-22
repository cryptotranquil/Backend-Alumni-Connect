# Alumni Connect Backend — Alumni Roster & Registration: Handover

Drafted fresh (no prior version existed) covering Steps 1–4 of the alumni-roster project.

## What this project is

Adds an "alumni roster" to the backend so alumni registration can be auto-approved against a real list of
graduates, instead of every alumnus needing manual admin approval.

## Environment — read this before touching anything

- Backend: Node/Express + Firestore (`firebase-admin`).
- `npm run dev` connects to **real cloud Firestore**, project `alumni-database-final`, via
  `serviceAccountKey.json` in the backend root. `.env`'s `FIRESTORE_EMULATOR_HOST` is commented out — this
  is not an emulator setup.
- `npm run test:integration` is the *one* exception: it spins up a **separate, local, ephemeral Firestore
  emulator** (`firebase-tools emulators:exec --only firestore --project alumni-connect-test`) purely for
  that script. It needs a JDK (11+) installed to run at all. Don't confuse its data with the real project —
  they are entirely different targets.
- API testing is via a Bruno collection (`alumni-connect-api`), specifically folders **`15 Alumni Roster`**
  and **`16 Alumni Registration`**. Both need a fresh `{{adminToken}}` — run `01 Auth > Login admin` before
  either, since tokens are short-lived (`SESSION_MINUTES`, default 10) and get rejected by
  `authMiddleware.js`'s `tokenVersion` check.

## Status by step

### Step 1 — Core roster logic — **Done**
- `src/utils/registrationNumber.js`: parsing/normalizing/validating numbers (`BIT/24/BT/ME/009` format).
- CSV/Excel roster-upload parser with row-level error checking.
- `src/services/alumniRosterService.js`: import, claim, release, create, edit, delete, list, stats, import
  history — all transactional where it matters (claim/release).
- Unit tests run against a fake in-memory database (no live Firestore needed for `npm test`).

### Step 2 — Admin endpoints — **Done**
- REST endpoints under `/api/admin/alumni-roster`: upload (dry-run preview + save), list/search,
  single-entry management, release-a-claim, re-check-pending-alumni, template download.
- Wired into existing admin routes + audit log.
- Bruno folder `15 Alumni Roster` — 32/32 passing against the real API.

### Step 3 — Registration integration — **Done**
Verified line-by-line against the actual code (not just claimed — checked):
- `authController.js` register handler validates the registration number format and calls
  `decideAlumniRegistration` to try claiming it.
- `alumniRegistration.js`: found+unclaimed → `accountStatus: "active"`, `approvalSource: "roster"`,
  session token issued immediately. Not found / already claimed → `accountStatus: "pending"`, no token,
  explanatory message — same shape as the pre-existing manual-approval path.
- Race-condition guard: if the roster claim comes back `already_claimed` at the exact moment of
  registration, re-checks and returns 409 instead of creating a duplicate pending account.
- If user creation fails *after* a successful claim, the claim is released (`undoClaim` in a catch block)
  so the roster entry isn't left locked to a nonexistent account.
- `adminController.deleteUser` releases the deleted alumnus's claimed roster entry
  (`releaseForDeletedUser`).
- `adminController.approveAlumni` (manual approval) sets `approvalSource: "manual"`, `approvedBy`,
  `approvedAt`. `rosterApproval.service.js` (bulk/roster-driven approval) sets `approvalSource: "roster"`.

### Step 4 — Docs, seed data, tests — **Mostly done**

| Item | Status |
|---|---|
| Bruno tests for roster-hit / roster-miss / malformed number | Done — but living in `16 Alumni Registration` (requests 02, 05, 06, 07), not a separate "Auth" folder as originally planned. Functionally complete either way. |
| Sample roster entries in `scripts/seedCollections.js` | Done — 4 entries (`BSE/16/LL/NE/004` claimed, 3 unclaimed) |
| `docs/alumni-connect-firestore-schema.md` | **Done now** — drafted fresh in this handover pass, covering all 23 collections + the Step 3 registration-flow changes. No prior version existed to merge into. |
| This file | Done — being created now |

## Known issues fixed this session

- **`src/routes/directoryRoutes.js`**: the `/directory/alumni` route's `authorize("student", "admin")` was
  missing the `"alumni"` role, so an *approved* alumnus still got 403 trying to view the alumni directory
  (Bruno test 14, "Approved alumnus can now use alumni areas"). Fix: change to
  `authorize("student", "alumni", "admin")`. **Confirm this is applied and the server was restarted** —
  it was proposed mid-session and the fix's effect wasn't independently re-verified after a fully clean
  Bruno run.

## Known gotcha: data hygiene between Bruno runs

Folder `16 Alumni Registration`'s cleanup requests (18–22) only run if the folder completes end-to-end. If
a run is interrupted partway (e.g. an expired admin token causing an auth cascade), the fixed test
registration numbers it uses — `QAT/22/BT/NE/701`, `/702`, `/703` — are left claimed by orphaned accounts in
`users`, and any subsequent run will 409 trying to reuse them (`findByRegistrationNumber` blocks re-use
regardless of the randomized test email). **Before rerunning folder 16 after a partial failure**, manually
check/delete `users` docs with those `registrationNumber` values (and matching `alumniRoster` entries for
701/702) via the Firebase console before trying again.

## Open item — not started

**Frontend gap:** the alumni registration form doesn't currently send a `registrationNumber` in its POST to
`/register`, so alumni registration 400s end-to-end from the actual frontend (Bruno/API-level testing
works fine since those requests send it explicitly). Needs the frontend zip to locate the registration
form component and wire the field in, matching the backend's expected format
(`src/utils/registrationNumber.js`, example `BIT/24/BT/ME/009`).

## Quick reference: file map

- `src/utils/registrationNumber.js` — parsing/normalizing/validating registration numbers
- `src/services/alumniRosterService.js` — roster CRUD + claim/release (Firestore collection `alumniRoster`)
- `src/services/alumniRegistration.js` — registration-time decision logic (active vs pending)
- `src/services/rosterApproval.service.js` — bulk auto-approval after imports / re-check endpoint
- `src/controllers/authController.js` — `/register`, `/login`
- `src/controllers/adminController.js` — `deleteUser`, `approveAlumni`, admin roster endpoints
- `src/controllers/alumniRosterController.js`, `src/routes/alumniRosterRoutes.js` — `/api/admin/alumni-roster/*`
- `src/routes/directoryRoutes.js` — `/directory/alumni`, `/directory/students` (fixed this session)
- `scripts/seedCollections.js` — sample data for all 23 collections, including 4 roster entries
- `docs/alumni-roster-schema.md` — original roster-only schema notes (now folded into the master schema doc)
- `docs/alumni-connect-firestore-schema.md` — master schema doc, all 23 collections (this handover pass)
