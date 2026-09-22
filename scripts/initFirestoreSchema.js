/**
 * One-time (idempotent, safe to re-run) Firestore bootstrap for the schema
 * described in `alumni-connect-firestore-schema.md`.
 *
 * What it does, in order:
 *   1. Connects using the exact same credentials src/config/firestore.js
 *      already uses (.env: FIREBASE_SERVICE_ACCOUNT_JSON /
 *      GOOGLE_APPLICATION_CREDENTIALS / FIRESTORE_EMULATOR_HOST).
 *   2. Seeds the canonical departments and community groups (reuses the
 *      existing, already-idempotent ensureSeeded() in each service — no
 *      logic is duplicated here).
 *   3. Writes a `system/schemaInfo` document listing every collection the
 *      design expects, so the schema is visible from the Firestore console
 *      itself, not just from a markdown file in the repo.
 *   4. Optionally creates one initial admin account, from the same
 *      INITIAL_ADMIN_* env vars `npm run seed` already uses — skipped if
 *      unset or if that email already exists.
 *
 * What it deliberately does NOT do:
 *   - Deploy firestore.rules / firestore.indexes.json. Those are config for
 *     the Firebase CLI, not something the Admin SDK can push — run
 *       firebase deploy --only firestore:rules,firestore:indexes
 *     yourself once you're connected (or wire it into CI).
 *   - Create placeholder documents in every other collection. Firestore has
 *     no concept of an "empty collection" — jobPosts, posts, conversations,
 *     etc. come into existence the first time the app writes to them, and
 *     seeding fake rows into them would just be data you'd have to remember
 *     to delete later.
 *
 * Usage:
 *   cd backend
 *   node scripts/initFirestoreSchema.js
 *   # or: npm run init:schema
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const db = require("../src/config/firestore");
const departmentService = require("../src/services/departmentService");
const groupService = require("../src/services/groupService");
const userService = require("../src/services/userService");
const { checkPassword } = require("../src/utils/passwordPolicy");

const SCHEMA_VERSION = "2026-09-21";

// Mirrors the "Collection map" table in alumni-connect-firestore-schema.md.
// Keep the two in sync if you add or rename a collection.
const COLLECTIONS = [
  { name: "users", purpose: "Accounts: identity, role, auth/security state, full profile" },
  { name: "profiles", purpose: "Legacy — merged into users on read, nothing writes here anymore" },
  { name: "departments", purpose: "Department catalog + programme lists" },
  { name: "jobPosts", purpose: "Job board postings" },
  { name: "jobReferrals", purpose: "\"I'll refer you\" records on a job" },
  { name: "events", purpose: "Campus/alumni events" },
  { name: "eventRegistrations", purpose: "RSVP/attendance" },
  { name: "groups", purpose: "Interest/department groups" },
  { name: "groupMemberships", purpose: "Join state" },
  { name: "posts", purpose: "Feed posts (global or group-scoped)" },
  { name: "mentorshipRequests", purpose: "Student to alumni mentor request" },
  { name: "mentorshipMatches", purpose: "Accepted request to active mentorship" },
  { name: "mentorshipOffers", purpose: "Alumni to student unsolicited offer" },
  { name: "conversations", purpose: "1:1 DM thread headers (messages is a subcollection)" },
  { name: "notifications", purpose: "In-app + email notification log" },
  { name: "follows", purpose: "Follow graph" },
  { name: "recommendations", purpose: "Written recommendations" },
  { name: "skillEndorsements", purpose: "Skill endorsements, one per endorser per skill" },
  { name: "businesses", purpose: "Alumni business directory" },
  { name: "businessReviews", purpose: "Reviews on a business, moderated" },
  { name: "auditLogs", purpose: "Admin action log" },
  { name: "alumniRoster", purpose: "Official alumni list keyed by registration number (BIT-24-BT-ME-009); a match at registration auto-approves the alumnus" },
  { name: "rosterImports", purpose: "History of alumni-list uploads (who, when, file name, counts)" },
];

async function writeSchemaManifest() {
  await db.collection("system").doc("schemaInfo").set({
    schemaVersion: SCHEMA_VERSION,
    collections: COLLECTIONS,
    appliedAt: new Date(),
  });
  console.log(`Wrote schema manifest (system/schemaInfo), version ${SCHEMA_VERSION}.`);
}

async function seedInitialAdmin() {
  const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  const name = process.env.INITIAL_ADMIN_NAME?.trim() || "System Administrator";

  if (!email || !password) {
    console.log("INITIAL_ADMIN_EMAIL/PASSWORD not set — skipping admin creation.");
    return;
  }
  if (await userService.findByEmail(email)) {
    console.log(`Initial administrator already exists: ${email}`);
    return;
  }
  const strength = checkPassword(password);
  if (!strength.ok) {
    throw new Error(`INITIAL_ADMIN_PASSWORD is too weak. ${strength.message}`);
  }

  const [firstname, ...rest] = name.split(/\s+/);
  await userService.createUser({
    firstname,
    lastname: rest.join(" "),
    email,
    password,
    role: "admin",
    department: "Administration",
    accountStatus: "active",
    mustChangePassword: false,
  });
  console.log(`Created initial administrator: ${email}`);
}

async function run() {
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    "(from service account credentials)";
  const target = process.env.FIRESTORE_EMULATOR_HOST
    ? `emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`
    : `live project "${projectId}"`;
  console.log(`Initializing Firestore schema against: ${target}\n`);

  console.log("1/3 Seeding canonical departments and community groups...");
  await Promise.all([departmentService.ensureSeeded(), groupService.ensureSeeded()]);

  console.log("2/3 Writing schema manifest...");
  await writeSchemaManifest();

  console.log("3/3 Initial administrator...");
  await seedInitialAdmin();

  console.log(
    "\nDone. Reminder — this script does not deploy security rules or indexes:\n" +
      "  firebase deploy --only firestore:rules,firestore:indexes\n",
  );
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Firestore schema init failed:", error);
    process.exit(1);
  });
