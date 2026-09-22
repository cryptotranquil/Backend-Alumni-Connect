/**
 * Creates the remaining Firestore collections from
 * `alumni-connect-firestore-schema.md`, by writing a small, linked set of
 * SAMPLE documents into each one.
 *
 * Why sample documents: Firestore has no such thing as an empty collection.
 * A collection only shows up in the console once it holds at least one
 * document, so this is the only way to see all 23 collections up front.
 * (`npm run seed` already created `departments` and `groups`.)
 *
 * What it creates (all with fixed `seed-...` IDs, so re-running just
 * overwrites the same docs and `--clean` can remove exactly these docs):
 *   users, jobPosts, jobReferrals, events, eventRegistrations,
 *   groupMemberships, posts, mentorshipRequests, mentorshipMatches,
 *   mentorshipOffers, conversations (+ messages subcollection),
 *   notifications, follows, recommendations, skillEndorsements,
 *   businesses, businessReviews, auditLogs, alumniRoster, rosterImports
 *
 * Skipped on purpose: `profiles`. The schema marks it legacy/dead (nothing
 * writes to it), so seeding it would only add clutter.
 *
 * Usage (from /backend):
 *   node scripts/seedCollections.js              # write sample data
 *   node scripts/seedCollections.js --dry-run    # print what would be written
 *   node scripts/seedCollections.js --clean      # delete the sample data
 *
 * Sample-account password: set SEED_SAMPLE_PASSWORD in .env, otherwise a random
 * one is generated and printed once at the end.
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const crypto = require("crypto");
const {
  parseRegistrationNumber,
  toDocId,
} = require("../src/utils/registrationNumber");

// Same hashing the services use for deterministic IDs (see eventService,
// groupService, jobService, socialService).
const stableId = (...parts) =>
  crypto.createHash("sha256").update(parts.join("\u0000")).digest("hex");
const conversationIdFor = (a, b) => [a, b].sort().join("_");

const daysFromNow = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

// Sample user IDs
const U = {
  admin: "seed-admin",
  alumni1: "seed-alumni-1",
  alumni2: "seed-alumni-2",
  student1: "seed-student-1",
  student2: "seed-student-2",
};

/**
 * Pure builder: returns [{ path, data }] for every sample document.
 * `passwordHash` is injected so this stays testable without bcrypt.
 */
function buildDataset(passwordHash) {
  const docs = [];
  const add = (path, data) => docs.push({ path, data });
  const stamp = (createdAt = new Date()) => ({ createdAt, updatedAt: createdAt });

  // ── users ────────────────────────────────────────────────────────────────
  const baseUser = {
    password: passwordHash,
    accountStatus: "active",
    mustChangePassword: false,
    tokenVersion: 0,
    failedLoginAttempts: 0,
    lockUntil: null,
  };

  add(`users/${U.admin}`, {
    ...baseUser,
    email: "admin.sample@example.com",
    role: "admin",
    firstname: "Sample",
    lastname: "Admin",
    department: "Administration",
    ...stamp(daysFromNow(-60)),
  });

  add(`users/${U.alumni1}`, {
    ...baseUser,
    email: "chikondi.banda.sample@example.com",
    role: "alumni",
    firstname: "Chikondi",
    lastname: "Banda",
    department: "Software Engineering",
    program: "BSc Software Engineering",
    campus: "LL",
    registrationNumber: "BSE/16/LL/NE/004",
    approvalSource: "roster", // number was on the alumni roster
    graduationYear: "2020",
    university: "Sample University",
    company: "Sample Telecom",
    position: "Senior Software Engineer",
    industry: "Technology",
    yearsOfExperience: 6,
    careerGoals: "Grow into an engineering lead and mentor graduates.",
    location: "Lilongwe, Malawi",
    headline: "Senior Software Engineer at Sample Telecom",
    bio: "Sample alumni account. Backend engineer, happy to mentor.",
    skills: ["JavaScript", "Node.js", "System Design"],
    interests: ["Mentoring", "Open source"],
    ...stamp(daysFromNow(-50)),
  });

  add(`users/${U.alumni2}`, {
    ...baseUser,
    email: "thoko.phiri.sample@example.com",
    role: "alumni",
    firstname: "Thoko",
    lastname: "Phiri",
    department: "Accounting & Finance",
    program: "BSc Accounting",
    campus: "BT",
    registrationNumber: "BAF/14/BT/NE/011",
    approvalSource: "manual", // not on the roster; an admin approved by hand
    graduationYear: "2018",
    university: "Sample University",
    company: "Sample Bank",
    position: "Audit Manager",
    industry: "Finance",
    yearsOfExperience: 8,
    careerGoals: "Build a small advisory practice.",
    location: "Blantyre, Malawi",
    headline: "Audit Manager at Sample Bank",
    bio: "Sample alumni account. Audit and tax, runs a side business.",
    skills: ["Auditing", "Taxation", "Excel"],
    interests: ["Entrepreneurship"],
    ...stamp(daysFromNow(-48)),
  });

  add(`users/${U.student1}`, {
    ...baseUser,
    email: "mphatso.kachale.sample@example.com",
    role: "student",
    firstname: "Mphatso",
    lastname: "Kachale",
    registrationNumber: "BSE-26-001",
    department: "Software Engineering",
    program: "BSc Software Engineering",
    campus: "LL",
    graduationYear: "2027",
    university: "Sample University",
    location: "Lilongwe, Malawi",
    headline: "BSc Software Engineering student",
    bio: "Sample student account.",
    skills: ["JavaScript", "React"],
    interests: ["Web development", "Mentorship"],
    careerGoals: "Become a full-stack engineer.",
    ...stamp(daysFromNow(-40)),
  });

  add(`users/${U.student2}`, {
    ...baseUser,
    email: "grace.mwale.sample@example.com",
    role: "student",
    firstname: "Grace",
    lastname: "Mwale",
    registrationNumber: "BAF-26-002",
    department: "Accounting & Finance",
    program: "BSc Accounting",
    campus: "MZ",
    graduationYear: "2027",
    university: "Sample University",
    location: "Mzuzu, Malawi",
    headline: "BSc Accounting student",
    bio: "Sample student account.",
    skills: ["Accounting", "Excel"],
    interests: ["Audit", "Banking"],
    careerGoals: "Join a Big Four audit team.",
    ...stamp(daysFromNow(-39)),
  });

  // ── jobPosts / jobReferrals ──────────────────────────────────────────────
  add("jobPosts/seed-job-1", {
    title: "Junior Backend Developer",
    company: "Sample Telecom",
    location: "Lilongwe",
    description: "Sample posting. Build and maintain Node.js services.",
    requirements: ["Node.js", "REST APIs", "Git"],
    salary: "Negotiable",
    deadline: daysFromNow(30).toISOString().slice(0, 10),
    contactEmail: "careers.sample@example.com",
    type: "full-time",
    postedBy: U.alumni1,
    status: "approved",
    applicants: [U.student1],
    applicantsCount: 1,
    ...stamp(daysFromNow(-10)),
  });
  add("jobPosts/seed-job-2", {
    title: "Audit Intern",
    company: "Sample Bank",
    location: "Blantyre",
    description: "Sample posting awaiting admin approval.",
    requirements: ["Accounting student", "Excel"],
    salary: "",
    deadline: daysFromNow(20).toISOString().slice(0, 10),
    contactEmail: "",
    type: "internship",
    postedBy: U.alumni2,
    status: "pending",
    applicants: [],
    applicantsCount: 0,
    ...stamp(daysFromNow(-2)),
  });
  add(`jobReferrals/${stableId("seed-job-1", U.alumni1, U.student1)}`, {
    jobId: "seed-job-1",
    studentId: U.student1,
    referrerId: U.alumni1,
    note: "Strong candidate, worked with him on a project.",
    createdAt: daysFromNow(-8),
  });

  // ── events / eventRegistrations ──────────────────────────────────────────
  add("events/seed-event-1", {
    title: "Alumni Networking Evening",
    description: "Sample event. Meet alumni from across campuses.",
    startDate: daysFromNow(14),
    endDate: null,
    eventType: "in-person",
    location: "Lilongwe Campus Main Hall",
    onlineMeetingUrl: null,
    imageUrl: "",
    createdBy: U.admin,
    ...stamp(daysFromNow(-12)),
  });
  for (const userId of [U.student1, U.alumni1]) {
    add(`eventRegistrations/${stableId("seed-event-1", userId)}`, {
      eventId: "seed-event-1",
      userId,
      status: "registered",
      registeredAt: daysFromNow(-5),
      updatedAt: daysFromNow(-5),
    });
  }

  // ── groupMemberships (groups come from `npm run seed`) ───────────────────
  // memberCount on the group docs is intentionally left alone.
  const memberships = [
    ["grp-1", U.student1],
    ["grp-1", U.alumni1],
    ["grp-6", U.student2],
    ["grp-6", U.alumni2],
  ];
  for (const [groupId, userId] of memberships) {
    add(`groupMemberships/${stableId(groupId, userId)}`, {
      groupId,
      userId,
      createdAt: daysFromNow(-20),
    });
  }

  // ── posts ────────────────────────────────────────────────────────────────
  add("posts/seed-post-1", {
    authorId: U.alumni1,
    category: "Career Update",
    text: "Sample post: excited to share that I've just been promoted to senior engineer!",
    imageUrl: "",
    groupId: null,
    likes: [U.student1, U.alumni2],
    comments: [
      {
        _id: "seed-comment-1",
        userId: U.student1,
        authorName: "Mphatso Kachale",
        authorPhoto: "",
        authorRole: "student",
        text: "Congratulations! Well deserved.",
        createdAt: daysFromNow(-3).toISOString(),
      },
    ],
    ...stamp(daysFromNow(-4)),
  });
  add("posts/seed-post-2", {
    authorId: U.student1,
    category: "General",
    text: "Sample group post: anyone up for a weekend study session on system design?",
    imageUrl: "",
    groupId: "grp-1",
    likes: [U.alumni1],
    comments: [],
    ...stamp(daysFromNow(-2)),
  });
  add("posts/seed-post-3", {
    authorId: U.admin,
    category: "News",
    text: "Sample announcement: the alumni networking evening is open for registration.",
    imageUrl: "",
    groupId: null,
    likes: [],
    comments: [],
    ...stamp(daysFromNow(-1)),
  });

  // ── mentorship ───────────────────────────────────────────────────────────
  const conversationId = conversationIdFor(U.student1, U.alumni1);

  add("mentorshipRequests/seed-request-1", {
    studentId: U.student1,
    mentorId: U.alumni1,
    skillsRequested: ["Node.js", "System Design"],
    interests: ["Web development"],
    careerGoals: "Become a full-stack engineer.",
    preferredIndustry: "Technology",
    message: "Hi, I'd love your guidance on backend development.",
    matchScore: 85,
    matchDetails: { skillOverlap: 2, sameDepartment: true },
    status: "approved",
    ...stamp(daysFromNow(-15)),
  });
  add("mentorshipRequests/seed-request-2", {
    studentId: U.student2,
    mentorId: U.alumni2,
    skillsRequested: ["Auditing"],
    interests: ["Audit"],
    careerGoals: "Join a Big Four audit team.",
    preferredIndustry: "Finance",
    message: "Could you mentor me on breaking into audit?",
    matchScore: 78,
    matchDetails: { skillOverlap: 1, sameDepartment: true },
    status: "pending",
    ...stamp(daysFromNow(-3)),
  });
  add("mentorshipMatches/seed-match-1", {
    studentId: U.student1,
    mentorId: U.alumni1,
    conversationId,
    status: "active",
    startedAt: daysFromNow(-14),
    completedAt: null,
    feedback: null,
    ...stamp(daysFromNow(-14)),
  });
  add("mentorshipOffers/seed-offer-1", {
    mentorId: U.alumni2,
    studentId: U.student1,
    status: "pending",
    ...stamp(daysFromNow(-1)),
  });

  // ── conversations (+ messages subcollection) ─────────────────────────────
  const msgs = [
    [U.student1, U.alumni1, "Hi Chikondi, thanks for accepting my request!", -13],
    [U.alumni1, U.student1, "Happy to help. What are you working on right now?", -13],
    [U.student1, U.alumni1, "A REST API in Node. Could we review it next week?", -12],
  ];
  const last = msgs[msgs.length - 1];
  add(`conversations/${conversationId}`, {
    participantIds: [U.student1, U.alumni1].sort(),
    mentorshipMatchId: "seed-match-1",
    lastMessage: last[2],
    lastMessageAt: daysFromNow(last[3]),
    lastMessageSenderId: last[0],
    ...stamp(daysFromNow(-14)),
  });
  msgs.forEach(([senderId, receiverId, message, offset], i) => {
    add(`conversations/${conversationId}/messages/seed-msg-${i + 1}`, {
      senderId,
      receiverId,
      message,
      read: true,
      createdAt: daysFromNow(offset),
    });
  });

  // ── notifications ────────────────────────────────────────────────────────
  const notif = (id, userId, type, title, message, data, actionUrl, isRead, offset) =>
    add(`notifications/${id}`, {
      userId,
      type,
      title,
      message,
      data,
      actionUrl,
      imageUrl: null,
      isRead,
      readAt: isRead ? daysFromNow(offset + 0.1) : null,
      ...stamp(daysFromNow(offset)),
    });
  notif("seed-notif-1", U.alumni1, "mentorship_request", "New mentorship request",
    "Mphatso Kachale asked you to be their mentor.",
    { requestId: "seed-request-1", studentId: U.student1 }, "/mentorship", true, -15);
  notif("seed-notif-2", U.student1, "mentorship_accepted", "Mentorship accepted",
    "Chikondi Banda accepted your mentorship request.",
    { requestId: "seed-request-1", mentorId: U.alumni1 }, "/messages", true, -14);
  notif("seed-notif-3", U.alumni2, "mentorship_request", "New mentorship request",
    "Grace Mwale asked you to be their mentor.",
    { requestId: "seed-request-2", studentId: U.student2 }, "/mentorship", false, -3);
  notif("seed-notif-4", U.alumni1, "new_message", "New message",
    "Mphatso Kachale sent you a message.",
    { conversationId }, "/messages", false, -12);

  // ── social graph ─────────────────────────────────────────────────────────
  for (const [followerId, targetId] of [
    [U.student1, U.alumni1],
    [U.student2, U.alumni2],
    [U.alumni1, U.student1],
  ]) {
    add(`follows/${stableId(followerId, targetId)}`, {
      followerId,
      targetId,
      ...stamp(daysFromNow(-10)),
    });
  }
  add("recommendations/seed-rec-1", {
    targetUserId: U.student1,
    fromUserId: U.alumni1,
    relation: "Mentor",
    text: "Sample recommendation: Mphatso learns fast and writes clean code.",
    ...stamp(daysFromNow(-6)),
  });
  for (const [targetUserId, endorserId, skill] of [
    [U.student1, U.alumni1, "JavaScript"],
    [U.alumni1, U.student1, "Node.js"],
  ]) {
    add(`skillEndorsements/${stableId(targetUserId, skill.toLowerCase(), endorserId)}`, {
      targetUserId,
      endorserId,
      skill,
      ...stamp(daysFromNow(-5)),
    });
  }

  // ── businesses / businessReviews ─────────────────────────────────────────
  add("businesses/seed-business-1", {
    name: "Sample Advisory Services",
    description: "Sample listing. Small-business accounting and tax advisory.",
    location: "Blantyre",
    phone: "+265 999 000 000",
    email: "hello.sample@example.com",
    website: null,
    services: ["Bookkeeping", "Tax returns", "Business registration"],
    ownerId: U.alumni2,
    ...stamp(daysFromNow(-25)),
  });
  add("businessReviews/seed-review-1", {
    businessId: "seed-business-1",
    reviewerId: U.student2,
    comment: "Sample review: clear, practical advice for a small startup.",
    status: "published",
    ...stamp(daysFromNow(-7)),
  });
  add("businessReviews/seed-review-2", {
    businessId: "seed-business-1",
    reviewerId: U.student1,
    comment: "Sample review awaiting moderation.",
    status: "pending",
    ...stamp(daysFromNow(-1)),
  });

  // ── alumniRoster + rosterImports ─────────────────────────────────────────
  // Same shape and IDs as services/alumniRosterService (ID = number with "/" -> "-").
  const importedAt = daysFromNow(-30);
  const rosterEntry = (registrationNumber, fields, claimedBy = null) => {
    const parts = parseRegistrationNumber(registrationNumber);
    add(`alumniRoster/${toDocId(parts.normalized)}`, {
      registrationNumber: parts.normalized,
      fullName: fields.fullName,
      department: fields.department || "",
      program: fields.program || "",
      graduationYear: fields.graduationYear || "",
      email: (fields.email || "").toLowerCase(),
      programCode: parts.programCode,
      admissionYear: parts.admissionYear,
      locationCode: parts.locationCode,
      entryType: parts.entryType,
      sequence: parts.sequence,
      status: claimedBy ? "claimed" : "unclaimed",
      claimedBy,
      claimedAt: claimedBy ? daysFromNow(-50) : null,
      importBatchId: "seed-import-1",
      createdAt: importedAt,
      updatedAt: claimedBy ? daysFromNow(-50) : importedAt,
    });
  };

  rosterEntry(
    "BSE/16/LL/NE/004",
    {
      fullName: "Chikondi Banda",
      department: "Software Engineering",
      program: "BSc Software Engineering",
      graduationYear: "2020",
      email: "chikondi.banda.sample@example.com",
    },
    U.alumni1,
  );
  rosterEntry("BIT/21/BT/ME/009", {
    fullName: "Tamanda Phiri",
    department: "Information Technology",
    program: "BSc Information Technology",
    graduationYear: "2024",
  });
  rosterEntry("BIT/20/BT/NE/012", {
    fullName: "Yamikani Mwale",
    department: "Information Technology",
    program: "BSc Information Technology",
    graduationYear: "2024",
    email: "yamikani.mwale.sample@example.com",
  });
  rosterEntry("BBA/19/LL/NE/015", {
    fullName: "Limbani Chirwa",
    department: "Business Management",
    program: "BCom Business Management",
    graduationYear: "2023",
  });

  add("rosterImports/seed-import-1", {
    fileName: "alumni-list-sample.xlsx",
    uploadedBy: U.admin,
    uploadedByEmail: "admin.sample@example.com",
    totalRows: 4,
    errorRows: 0,
    created: 4,
    updated: 0,
    skippedClaimed: 0,
    createdAt: importedAt,
  });

  // ── auditLogs ────────────────────────────────────────────────────────────
  add("auditLogs/seed-audit-1", {
    actorId: U.admin,
    actorEmail: "admin.sample@example.com",
    action: "admin.approveJob",
    targetId: "seed-job-1",
    method: "PUT",
    path: "/api/admin/approve-job/seed-job-1",
    ip: "127.0.0.1",
    createdAt: daysFromNow(-9),
  });
  add("auditLogs/seed-audit-2", {
    actorId: U.admin,
    actorEmail: "admin.sample@example.com",
    action: "admin.deleteEvent",
    targetId: "seed-old-event",
    method: "DELETE",
    path: "/api/admin/events/seed-old-event",
    ip: "127.0.0.1",
    createdAt: daysFromNow(-2),
  });

  return docs;
}

// ── runner ──────────────────────────────────────────────────────────────────

function targetLabel() {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    return `emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`;
  }
  const id = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  return id ? `live project "${id}"` : "live project (from service account)";
}

async function commitInChunks(db, docs, apply) {
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    docs.slice(i, i + 400).forEach((doc) => apply(batch, db.doc(doc.path), doc));
    await batch.commit();
  }
}

async function run() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run");
  const clean = args.has("--clean");

  const bcrypt = require("bcryptjs");
  const { checkPassword } = require("../src/utils/passwordPolicy");

  let password = process.env.SEED_SAMPLE_PASSWORD;
  let generated = false;
  if (!password) {
    // Random, and always satisfies the password policy.
    password = `${crypto.randomBytes(9).toString("base64url")}aA1!`;
    generated = true;
  }
  const strength = checkPassword(password);
  if (!strength.ok) {
    throw new Error(`SEED_SAMPLE_PASSWORD is too weak. ${strength.message}`);
  }

  const passwordHash = dryRun || clean ? "<hash>" : await bcrypt.hash(password, 12);
  const docs = buildDataset(passwordHash);

  console.log(`Target: ${targetLabel()}`);

  if (dryRun) {
    const counts = {};
    docs.forEach((d) => {
      const top = d.path.split("/")[0];
      counts[top] = (counts[top] || 0) + 1;
    });
    console.log(`Dry run: would write ${docs.length} documents:`);
    Object.entries(counts).forEach(([name, n]) => console.log(`  ${name}: ${n}`));
    return;
  }

  const db = require("../src/config/firestore");

  if (clean) {
    await commitInChunks(db, docs, (batch, ref) => batch.delete(ref));
    console.log(`Deleted ${docs.length} sample documents. (Empty collections disappear from the console on their own.)`);
    return;
  }

  await commitInChunks(db, docs, (batch, ref, doc) => batch.set(ref, doc.data));
  console.log(`Wrote ${docs.length} sample documents across ${new Set(docs.map((d) => d.path.split("/")[0])).size} collections.`);
  console.log("\nSample accounts (all use the same password):");
  Object.values(U).forEach((id) => {
    const user = docs.find((d) => d.path === `users/${id}`).data;
    console.log(`  ${user.role.padEnd(8)} ${user.email}`);
  });
  if (generated) {
    console.log(`\nGenerated password (shown once): ${password}`);
  }
  console.log("\nRemove all sample data later with: node scripts/seedCollections.js --clean");
}

module.exports = { buildDataset, stableId, conversationIdFor };

if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Seeding remaining collections failed:", error);
      process.exit(1);
    });
}