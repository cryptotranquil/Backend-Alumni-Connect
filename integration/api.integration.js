const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "integration-test-secret";
process.env.FIREBASE_PROJECT_ID ||= "alumni-connect-test";
process.env.CORS_ORIGIN = "http://localhost:5173";

const app = require("../server");
const db = require("../src/config/firestore");

async function clearFirestore() {
  const collections = await db.listCollections();
  for (const collection of collections) {
    const snap = await collection.get();
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = db.batch();
      snap.docs.slice(i, i + 400).forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
  }
}

async function main() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("Run this test through the Firestore emulator");
  }
  await clearFirestore();
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;

  async function request(method, path, { token, body } = {}) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error(`${method} ${path} -> ${response.status}: ${text}`);
    }
    return data;
  }

  try {
    assert.equal((await request("GET", "/bootstrap")).allowFirstAdminRegister, true);
    const departments = await request("GET", "/departments");
    assert.equal(departments.departments.length, 5);

    const adminAuth = await request("POST", "/register", {
      body: {
        name: "System Admin",
        email: "admin@example.com",
        password: "Admin#12345",
        role: "admin",
      },
    });
    assert.ok(adminAuth.token);

    const studentAuth = await request("POST", "/register", {
      body: {
        name: "Test Student",
        email: "student@example.com",
        password: "Student#12345",
        phone: "+265 999 123 456",
        role: "student",
        department: "Information Technology",
        program: "Bachelor of Information Technology",
        registrationNumber: "BIT/24/LL/NE/001",
        campus: "LL",
      },
    });
    assert.ok(studentAuth.token);
    assert.equal(studentAuth.user.graduationYear, "2028");

    // ── Alumni roster: numbers on the list are approved automatically ──────
    const rosterService = require("../src/services/alumniRosterService");
    const rosterRecord = (registrationNumber, fullName) => ({
      registrationNumber, fullName, department: "Information Technology",
      program: "Bachelor of Information Technology", graduationYear: "2023", email: "",
    });
    await rosterService.applyImport(
      [rosterRecord("BIT/19/BT/NE/003", "Test Alumni"), rosterRecord("BIT/18/BT/NE/005", "Delete Me")],
      { batchId: "integration" },
    );

    const alumniAuth = await request("POST", "/register", {
      body: {
        name: "Test Alumni",
        email: "alumni@example.com",
        password: "Alumni#12345",
        role: "alumni",
        department: "Information Technology",
        program: "Bachelor of Information Technology",
        graduationYear: "2020",
        registrationNumber: " bit/19/bt/ne/3 ", // any spelling of the roster number
      },
    });
    assert.ok(alumniAuth.token, "a roster number must activate the account immediately");
    assert.equal(alumniAuth.pendingApproval, false);
    assert.equal(alumniAuth.user.isApproved, true);
    const claimed = await rosterService.findByRegistrationNumber("BIT/19/BT/NE/003");
    assert.equal(claimed.status, "claimed");
    assert.equal(claimed.claimedBy, alumniAuth.user._id);


    // ── Strong passwords ────────────────────────────────────────────────────
    await assert.rejects(
      request("POST", "/register", {
        body: { name: "Weak Pass", email: "weak@example.com", password: "password1", role: "alumni",
          department: "Information Technology", program: "Bachelor of Information Technology", graduationYear: "2020" },
      }),
      /400.*symbol/s,
    );

    // ── Session length: register issues a 10-minute token ──────────────────
    const sessionClaims = jwt.decode(studentAuth.token);
    assert.equal(sessionClaims.exp - sessionClaims.iat, 600);
    assert.ok(studentAuth.expiresAt);

    // ── Two-factor sign-in (code is echoed back only under NODE_ENV=test) ──
    const challenge = await request("POST", "/login", {
      body: { email: "student@example.com", password: "Student#12345" },
    });
    assert.equal(challenge.twoFactorRequired, true);
    assert.equal(challenge.token, undefined, "no session before the second factor");
    assert.match(challenge.devCode, /^\d{6}$/);
    await assert.rejects(
      request("GET", "/profile", { token: challenge.twoFactorToken }),
      /401/,
      "a 2FA token must not work as a session token",
    );
    const wrongCode = challenge.devCode === "000000" ? "111111" : "000000";
    await assert.rejects(
      request("POST", "/login/verify-2fa", {
        body: { twoFactorToken: challenge.twoFactorToken, code: wrongCode },
      }),
      /401.*Incorrect code/s,
    );
    const verified = await request("POST", "/login/verify-2fa", {
      body: { twoFactorToken: challenge.twoFactorToken, code: challenge.devCode },
    });
    assert.ok(verified.token && verified.expiresAt);
    assert.equal(verified.user.twoFactorCodeHash, undefined);
    assert.equal((await request("GET", "/profile", { token: verified.token })).name, "Test Student");

    // Gmail addresses keep their dots so login finds the account.
    await request("POST", "/register", {
      body: { name: "Dot Gmail", email: "first.last@gmail.com", password: "Student#12345", role: "student",
        department: "Information Technology", program: "Bachelor of Information Technology",
        registrationNumber: "BIT/24/LL/NE/002", campus: "LL" },
    });
    const gmailChallenge = await request("POST", "/login", {
      body: { email: "first.last@gmail.com", password: "Student#12345" },
    });
    assert.equal(gmailChallenge.twoFactorRequired, true);

    const updatedAlumni = await request("PUT", "/profile/update", {
      token: alumniAuth.token,
      body: {
        headline: "Senior Engineer",
        company: "Example Ltd",
        position: "Senior Engineer",
        skills: ["React", "Node.js"],
        interests: ["Mentorship"],
        experiences: [
          {
            _id: "exp-1",
            title: "Senior Engineer",
            company: "Example Ltd",
            startDate: "2023-01",
            current: true,
          },
        ],
        achievements: [],
      },
    });
    assert.equal(updatedAlumni.headline, "Senior Engineer");
    assert.equal(updatedAlumni.experiences.length, 1);

    const profile = await request("GET", "/profile", {
      token: studentAuth.token,
    });
    assert.equal(profile.name, "Test Student");
    assert.equal(profile.success, undefined, "profile response must be a direct User");

    const directory = await request("GET", "/directory/alumni", {
      token: studentAuth.token,
    });
    assert.equal(directory.alumni[0].program, "Bachelor of Information Technology");

    const mentorMatches = await request("GET", "/mentors/matches", {
      token: studentAuth.token,
    });
    assert.equal(mentorMatches[0].mentor._id, alumniAuth.user._id);

    const connection = await request("POST", "/connections/request", {
      token: studentAuth.token,
      body: { alumniId: alumniAuth.user._id },
    });
    assert.equal(connection.status, "pending");
    const alumniConnections = await request("GET", "/connections/alumni", {
      token: alumniAuth.token,
    });
    assert.equal(alumniConnections.pending.length, 1);
    await request("PUT", `/connections/${connection._id}/accept`, {
      token: alumniAuth.token,
    });
    assert.equal(
      (await request("GET", `/connections/status/${alumniAuth.user._id}`, {
        token: studentAuth.token,
      })).status,
      "accepted",
    );

    const sent = await request("POST", "/messages", {
      token: studentAuth.token,
      body: { receiverId: alumniAuth.user._id, message: "Hello mentor" },
    });
    assert.equal(sent.message.message, "Hello mentor");

    const post = await request("POST", "/posts", {
      token: alumniAuth.token,
      body: { category: "Career Update", text: "A real backend post" },
    });
    assert.equal(post.author.name, "Test Alumni");
    const liked = await request("POST", `/posts/${post._id}/like`, {
      token: studentAuth.token,
    });
    assert.deepEqual(liked.likes, [studentAuth.user._id]);
    const commented = await request("POST", `/posts/${post._id}/comments`, {
      token: studentAuth.token,
      body: { text: "Congratulations" },
    });
    assert.equal(commented.comments.length, 1);

    assert.equal(
      (await request("POST", `/users/${alumniAuth.user._id}/follow`, {
        token: studentAuth.token,
      })).following,
      true,
    );
    const recommendations = await request(
      "POST",
      `/users/${alumniAuth.user._id}/recommendations`,
      {
        token: studentAuth.token,
        body: { relation: "mentee", text: "A thoughtful and helpful mentor." },
      },
    );
    assert.equal(recommendations.length, 1);
    const endorsement = await request(
      "POST",
      `/users/${alumniAuth.user._id}/endorse`,
      { token: studentAuth.token, body: { skill: "React" } },
    );
    assert.equal(endorsement.count, 1);

    const groups = await request("GET", "/groups", { token: studentAuth.token });
    assert.equal(groups.length, 8);
    assert.equal(
      (await request("POST", `/groups/${groups[0]._id}/toggle`, {
        token: studentAuth.token,
      })).joined,
      true,
    );

    const event = await request("POST", "/events", {
      token: adminAuth.token,
      body: {
        title: "Integration Event",
        description: "A test event",
        eventDate: new Date(Date.now() + 86_400_000).toISOString(),
        location: "Lilongwe",
      },
    });
    assert.equal(event.title, "Integration Event");
    assert.equal(
      (await request("POST", `/events/${event._id}/rsvp`, {
        token: studentAuth.token,
      })).rsvped,
      true,
    );
    assert.equal(
      (await request("GET", "/events/mine", { token: studentAuth.token })).events.length,
      1,
    );

    const job = await request("POST", "/jobs", {
      token: alumniAuth.token,
      body: {
        title: "Junior Developer",
        company: "Example Ltd",
        location: "Lilongwe",
        description: "Build and maintain web applications.",
        requirements: ["React"],
        type: "full-time",
        salary: "MWK 1,000,000",
      },
    });
    assert.equal(job.status, "pending");
    await request("PUT", `/admin/approve-job/${job._id}`, {
      token: adminAuth.token,
    });
    await request("POST", `/jobs/${job._id}/apply`, {
      token: studentAuth.token,
    });
    const referral = await request("POST", `/jobs/${job._id}/refer`, {
      token: alumniAuth.token,
      body: { studentId: studentAuth.user._id, note: "Strong candidate" },
    });
    assert.equal(referral.studentId, studentAuth.user._id);

    const stats = await request("GET", "/profile/stats", {
      token: studentAuth.token,
    });
    assert.equal(stats.jobsApplied, 1);
    assert.equal(stats.connectionsCount, 1);
    assert.equal(stats.eventsJoined, 1);

    // ── Roster registration flow (kept last so the extra alumni do not change earlier results) ──
    const alumniBody = (email, registrationNumber) => ({
      name: "Other Alumni",
      email,
      password: "Alumni#12345",
      role: "alumni",
      department: "Information Technology",
      program: "Bachelor of Information Technology",
      graduationYear: "2021",
      ...(registrationNumber === undefined ? {} : { registrationNumber }),
    });

    // Same number again (even spelled differently) is a duplicate.
    await assert.rejects(
      request("POST", "/register", { body: alumniBody("dup@example.com", "BIT-19-BT-NE-003") }),
      /409/,
    );
    // A registration number is required, and must have the right shape.
    await assert.rejects(request("POST", "/register", { body: alumniBody("nonum@example.com") }), /400.*required for alumni/s);
    await assert.rejects(request("POST", "/register", { body: alumniBody("oldfmt@example.com", "BSE/20/001") }), /400.*BIT\/24\/BT\/ME\/009/s);

    // Not on the roster: account is created pending, with no session.
    const pendingReg = await request("POST", "/register", {
      body: alumniBody("pending@example.com", "BIT/17/BT/NE/044"),
    });
    assert.equal(pendingReg.pendingApproval, true);
    assert.equal(pendingReg.token, null);
    assert.equal(pendingReg.user.isApproved, false);

    // They can sign in (2FA) but are blocked from alumni-only areas until approved.
    const pendingChallenge = await request("POST", "/login", {
      body: { email: "pending@example.com", password: "Alumni#12345" },
    });
    const pendingSession = await request("POST", "/login/verify-2fa", {
      body: { twoFactorToken: pendingChallenge.twoFactorToken, code: pendingChallenge.devCode },
    });
    await assert.rejects(
      request("GET", "/directory/alumni", { token: pendingSession.token }),
      /403.*pending admin approval/s,
    );

    // An admin approves them; access opens up straight away and the source is recorded.
    const approved = await request("PUT", `/admin/approve-alumni/${pendingReg.user._id}`, {
      token: adminAuth.token,
    });
    assert.equal(approved.isApproved, true);
    assert.equal(approved.approvalSource, "manual");
    await request("GET", "/directory/alumni", { token: pendingSession.token });

    // Registration number is fixed once set.
    await assert.rejects(
      request("PUT", "/profile/update", {
        token: pendingSession.token,
        body: { registrationNumber: "BIT/19/BT/NE/003" },
      }),
      /400.*can't be changed/s,
    );

    // Deleting an alumnus frees their roster entry.
    const deleteMe = await request("POST", "/register", {
      body: alumniBody("deleteme@example.com", "BIT/18/BT/NE/005"),
    });
    assert.equal(deleteMe.pendingApproval, false);
    assert.equal((await rosterService.findByRegistrationNumber("BIT/18/BT/NE/005")).status, "claimed");
    await request("DELETE", `/admin/users/${deleteMe.user._id}`, { token: adminAuth.token });
    assert.equal((await rosterService.findByRegistrationNumber("BIT/18/BT/NE/005")).status, "unclaimed");

    // A pending alumnus is approved automatically once their number is added to the roster.
    const late = await request("POST", "/register", {
      body: alumniBody("late@example.com", "BIT/16/BT/NE/070"),
    });
    assert.equal(late.pendingApproval, true);
    await request("POST", "/admin/alumni-roster", {
      token: adminAuth.token,
      body: { registrationNumber: "BIT/16/BT/NE/070", fullName: "Late Listed" },
    });
    const recheck = await request("POST", "/admin/alumni-roster/recheck-pending", {
      token: adminAuth.token,
    });
    assert.ok(recheck.result.approvedUsers.some((u) => u.id === late.user._id));
    const lateEntry = await rosterService.findByRegistrationNumber("BIT/16/BT/NE/070");
    assert.equal(lateEntry.status, "claimed");
    assert.equal(lateEntry.claimedBy, late.user._id);

    console.log("End-to-end API integration checks passed.");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
