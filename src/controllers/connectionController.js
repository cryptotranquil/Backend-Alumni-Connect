const userService = require("../services/userService");
const mentorshipService = require("../services/mentorshipService");
const matchingService = require("../services/matching.service");
const notificationService = require("../services/notification.service"); // Firestore-based (Phase 3g done)

// Firestore Timestamps come back as {_seconds, _nanoseconds} objects with a
// .toDate() method, not plain Dates or strings. Every date field returned to
// the frontend needs to go through this — missing it anywhere means that
// field silently serializes as a raw Timestamp object instead of a string.
const toIso = (d) => d?.toDate?.().toISOString?.() || d?.toISOString?.() || d;

const formatUserMini = (u) => {
  if (!u) return null;
  return {
    _id: u.id,
    name: u.name || `${u.firstname || ""} ${u.lastname || ""}`.trim(),
    email: u.email,
    profilePhoto: u.profilePhoto || "",
    role: u.role,
    graduationYear: u.graduationYear || "",
    company: u.company || "",
    position: u.jobTitle || u.position || "",
    department: u.department || "",
    program: u.program || u.programme || "",
    location: u.location || "",
    bio: u.bio || "",
    skills: u.skills || [],
    interests: Array.isArray(u.interests) ? u.interests : [],
  };
};

// ========== BASIC CONNECTION FUNCTIONS ==========

exports.requestConnection = async (req, res) => {
  const targetId = req.body.alumniId || req.body.targetId;
  const profileRequest = Boolean(req.body.targetId);
  if (!targetId) {
    return res.status(400).json({ success: false, message: "targetId is required" });
  }
  if (targetId === req.user.userId) {
    return res.status(400).json({ success: false, message: "You cannot connect with yourself" });
  }

  const target = await userService.findById(targetId);
  if (!target || target.accountStatus !== "active") {
    return res.status(404).json({ success: false, message: "Member not found" });
  }

  // Student -> alumni is the normal connection/mentorship request flow.
  if (req.user.role === "student" && target.role === "alumni") {
    const activeMatches = await mentorshipService.listMatchesForUser(
      req.user.userId,
      "student",
      "active",
    );
    if (activeMatches.some((match) => match.mentorId === targetId)) {
      return profileRequest
        ? res.json({ status: "accepted" })
        : res.status(409).json({ success: false, message: "Already connected" });
    }

    const existing = await mentorshipService.findRequestBetween(
      req.user.userId,
      targetId,
    );
    if (existing?.status === "pending") {
      return profileRequest
        ? res.json({ status: "pending" })
        : res.status(409).json({ success: false, message: "Request already pending" });
    }

    const request = await mentorshipService.createRequest({
      studentId: req.user.userId,
      mentorId: targetId,
      initiatedBy: req.user.userId,
      message: "",
      skillsRequested: [],
    });
    const io = req.app.get("io");
    if (io) {
      io.to(`user:${targetId}`).emit("connection:incoming", {
        connectionId: request.id,
        studentId: req.user.userId,
      });
    }
    if (profileRequest) return res.status(201).json({ status: "pending" });
    const alumniFull = await userService.getFullUser(targetId);
    return res.status(201).json({
      _id: request.id,
      status: request.status,
      alumni: formatUserMini(alumniFull),
    });
  }

  // Alumni -> student is persisted as a mentorship offer. The frontend shows
  // it as pending while the student decides whether to engage.
  if (req.user.role === "alumni" && target.role === "student") {
    await mentorshipService.createOffer(req.user.userId, targetId);
    return res.status(201).json({ status: "pending" });
  }

  return res.status(400).json({
    success: false,
    message: "Connections are currently supported between students and alumni",
  });
};

exports.getConnectionStatus = async (req, res) => {
  const target = await userService.findById(req.params.targetId);
  if (!target) return res.json({ status: "none" });

  let studentId;
  let mentorId;
  if (req.user.role === "student" && target.role === "alumni") {
    studentId = req.user.userId;
    mentorId = target.id;
  } else if (req.user.role === "alumni" && target.role === "student") {
    studentId = target.id;
    mentorId = req.user.userId;
  } else {
    return res.json({ status: "none" });
  }

  if (await mentorshipService.findMatchBetween(studentId, mentorId)) {
    return res.json({ status: "accepted" });
  }
  const request = await mentorshipService.findRequestBetween(studentId, mentorId);
  if (request?.status === "pending") return res.json({ status: "pending" });
  const offer = await mentorshipService.findOfferBetween(mentorId, studentId);
  if (offer?.status === "pending") return res.json({ status: "pending" });
  return res.json({ status: "none" });
};

exports.listForStudent = async (req, res) => {
  if (req.user.role !== "student") return res.status(403).json({ success: false, message: "Students only" });

  const requests = await mentorshipService.listRequestsByStudent(req.user.userId);
  const matches = await mentorshipService.listMatchesForUser(req.user.userId, "student", "active");
  // "approved" is an internal transitional status — once a match exists for
  // it, the match row below represents that relationship instead. Without
  // this filter, every accepted connection shows up TWICE: once as its
  // leftover "approved" request, once as its "accepted" match.
  const openRequests = requests.filter((r) => r.status !== "approved");
  const rows = [
    ...openRequests.map((r) => ({ id: r.id, mentorId: r.mentorId, status: r.status, updatedAt: r.updatedAt, matchScore: r.matchScore, skillsRequested: r.skillsRequested, message: r.message })),
    ...matches.map((m) => ({ id: m.id, mentorId: m.mentorId, status: "accepted", updatedAt: m.updatedAt, matchScore: m.matchScore })),
  ];

  const alumniIds = [...new Set(rows.map((r) => r.mentorId))];
  const alumniUsers = await Promise.all(alumniIds.map((id) => userService.getFullUser(id)));
  const alumniById = Object.fromEntries(alumniIds.map((id, i) => [id, alumniUsers[i]]));

  res.json(rows.map((r) => ({
    _id: r.id, status: r.status, alumni: formatUserMini(alumniById[r.mentorId]), updatedAt: toIso(r.updatedAt),
    matchScore: r.matchScore, mentorshipRequest: { skills: r.skillsRequested, message: r.message },
  })));
};

exports.listForAlumni = async (req, res) => {
  if (req.user.role !== "alumni") return res.status(403).json({ success: false, message: "Alumni only" });

  const pending = await mentorshipService.listPendingRequestsForMentor(req.user.userId);
  const matches = await mentorshipService.listMatchesForUser(req.user.userId, "alumni", "active")

  const pendingStudents = await Promise.all(pending.map((r) => userService.getFullUser(r.studentId)));
  const matchStudents = await Promise.all(matches.map((m) => userService.getFullUser(m.studentId)));

  res.json({
    pending: pending.map((r, i) => ({ _id: r.id, status: r.status, student: formatUserMini(pendingStudents[i]), createdAt: toIso(r.createdAt), matchScore: r.matchScore, mentorshipRequest: { skills: r.skillsRequested, message: r.message } })),
    accepted: matches.map((m, i) => ({ _id: m.id, status: "accepted", student: formatUserMini(matchStudents[i]), updatedAt: toIso(m.updatedAt), matchScore: m.matchScore })),
  });
};

exports.accept = async (req, res) => {
  if (req.user.role !== "alumni") return res.status(403).json({ success: false, message: "Alumni only" });
  const request = await mentorshipService.findRequestById(req.params.id);
  if (!request || request.mentorId !== req.user.userId || request.status !== "pending") return res.status(404).json({ success: false, message: "Request not found" });

  await mentorshipService.updateRequest(request.id, { status: "approved" });
  await mentorshipService.rejectOtherPendingRequests(request.studentId, request.id);
  const match = await mentorshipService.createMatch({ studentId: request.studentId, mentorId: request.mentorId, requestId: request.id, matchScore: request.matchScore, matchDetails: request.matchDetails });

  const io = req.app.get("io");
  if (io) io.to(`user:${request.studentId}`).emit("connection:accepted", { connectionId: match.id, alumniId: req.user.userId });

  try {
    const student = await userService.findById(request.studentId);
    const alumni = await userService.findById(req.user.userId);
    await notificationService.notifyMentorshipResponse(student, alumni, "accepted", null);
  } catch (err) { console.warn("[accept] notification step failed :", err.message); }

  const studentFull = await userService.getFullUser(request.studentId);
  res.json({ _id: match.id, status: "accepted", student: formatUserMini(studentFull), startedAt: toIso(match.startedAt) });
};

exports.reject = async (req, res) => {
  if (req.user.role !== "alumni") return res.status(403).json({ success: false, message: "Alumni only" });
  const request = await mentorshipService.findRequestById(req.params.id);
  if (!request || request.mentorId !== req.user.userId || request.status !== "pending") return res.status(404).json({ success: false, message: "Request not found" });

  await mentorshipService.updateRequest(request.id, { status: "rejected" });
  const io = req.app.get("io");
  if (io) io.to(`user:${request.studentId}`).emit("connection:rejected", { connectionId: request.id });

  try {
    const student = await userService.findById(request.studentId);
    const alumni = await userService.findById(req.user.userId);
    await notificationService.notifyMentorshipResponse(student, alumni, "rejected", null);
  } catch (err) { console.warn("[reject] notification step failed :", err.message); }

  res.json({ success: true, message: "Request declined" });
};

exports.cancel = async (req, res) => {
  if (req.user.role !== "student") return res.status(403).json({ success: false, message: "Students only" });
  const request = await mentorshipService.findRequestById(req.params.id);
  if (!request || request.studentId !== req.user.userId || request.status !== "pending") return res.status(404).json({ success: false, message: "Request not found" });
  await mentorshipService.deleteRequest(request.id);
  res.json({ success: true, message: "Request cancelled" });
};

// ========== MATCHING ALGORITHM FUNCTIONS ==========

exports.getMatchingSuggestions = async (req, res) => {
  if (req.user.role !== "student") return res.status(403).json({ success: false, message: "Only students can get matching suggestions" });

  const student = await userService.getFullUser(req.user.userId);
  const allUsers = await userService.listUsers();
  const alumniList = allUsers.filter((u) => u.role === "alumni" && u.accountStatus === "active");
  const alumniProfiles = await Promise.all(alumniList.map(async (a) => ({ ...(await userService.getFullUser(a.id)), _id: a.id })));

  const myRequests = await mentorshipService.listRequestsByStudent(req.user.userId);
  const excludeIds = new Set(myRequests.map((r) => r.mentorId));
  const availableAlumni = alumniProfiles.filter((a) => !excludeIds.has(a.id));

  const mentorshipRequest = { skills: student.skills || [], interests: student.mentorshipAreas || student.careerGoals || [], careerGoals: "", preferredIndustry: "", message: "" };
  const matches = matchingService.findBestMatches(availableAlumni, student, mentorshipRequest);
  const recommendedMatches = matchingService.filterMatchesByThreshold(matches);

  res.json({ success: true, matches: recommendedMatches.slice(0, 10), totalMatches: matches.length, recommendedCount: recommendedMatches.length });
};

exports.getMentorshipRequests = async (req, res) => {
  if (req.user.role !== "alumni") return res.status(403).json({ success: false, message: "Only alumni can view mentorship requests" });

  const requests = await mentorshipService.listPendingRequestsForMentor(req.user.userId);
  const students = await Promise.all(requests.map((r) => userService.getFullUser(r.studentId)));
  const sorted = requests.map((r, i) => ({ r, student: students[i] })).sort((a, b) => (b.r.matchScore || 0) - (a.r.matchScore || 0));

  res.json({ success: true, requests: sorted.map(({ r, student }) => ({ _id: r.id, status: r.status, student: formatUserMini(student), matchScore: r.matchScore, matchDetails: r.matchDetails, mentorshipRequest: { skills: r.skillsRequested, message: r.message }, createdAt: toIso(r.createdAt) })) });
};

exports.createMentorshipRequest = async (req, res) => {
  if (req.user.role !== "student") return res.status(403).json({ success: false, message: "Only students can request mentorship" });
  const { skills, interests, careerGoals, preferredIndustry, message } = req.body;

  if (await mentorshipService.studentHasActiveEngagement(req.user.userId)) {
    return res.status(400).json({ success: false, message: "You already have a pending or active mentorship request" });
  }

  const student = await userService.getFullUser(req.user.userId);
  const allUsers = await userService.listUsers();
  const alumniList = allUsers.filter((u) => u.role === "alumni" && u.accountStatus === "active");
  if (alumniList.length === 0) return res.status(404).json({ success: false, message: "No alumni available for mentorship" });

  const alumniProfiles = await Promise.all(alumniList.map(async (a) => ({ ...(await userService.getFullUser(a.id)), _id: a.id })));
  const mentorshipRequestInput = { skills: skills || student.skills || [], interests: interests || student.mentorshipAreas || student.careerGoals || [], careerGoals: careerGoals || "", preferredIndustry: preferredIndustry || "", message: message || "" };

  const matches = matchingService.findBestMatches(alumniProfiles, student, mentorshipRequestInput);
  const recommendedMatches = matchingService.filterMatchesByThreshold(matches);
  if (recommendedMatches.length === 0) {
    return res.status(404).json({ success: false, message: "No suitable mentors found. Please update your skills and interests.", topMatches: matches.slice(0, 5) });
  }

  const createdRequests = [];
  for (const match of recommendedMatches.slice(0, 5)) {
    const request = await mentorshipService.createRequest({ studentId: req.user.userId, mentorId: match.alumniId, skillsRequested: mentorshipRequestInput.skills, message: mentorshipRequestInput.message, matchScore: match.matchScore, matchDetails: match.matchDetails });
    createdRequests.push({ _id: request.id, status: request.status, matchScore: request.matchScore, matchDetails: request.matchDetails, alumni: match.alumni });
    try { await notificationService.notifyMentorshipRequest(student, match.alumni, match.matchScore, message); }
    catch (err) { console.warn("[createMentorshipRequest] notification step failed :", err.message); }
  }

  const io = req.app.get("io");
  if (io) createdRequests.forEach((r) => io.to(`user:${r.alumni._id}`).emit("connection:incoming", { connectionId: r._id, studentId: req.user.userId, matchScore: r.matchScore }));

  res.status(201).json({ success: true, message: `Mentorship requests sent to ${createdRequests.length} potential mentors`, connections: createdRequests });
};

exports.respondToMentorshipRequest = async (req, res) => {
  if (req.user.role !== "alumni") return res.status(403).json({ success: false, message: "Only alumni can respond to requests" });
  const { id } = req.params;
  const { status, message } = req.body;
  if (!["accepted", "rejected"].includes(status)) return res.status(400).json({ success: false, message: "Invalid status. Must be accepted or rejected" });

  const request = await mentorshipService.findRequestById(id);
  if (!request) return res.status(404).json({ success: false, message: "Connection not found" });
  if (request.mentorId !== req.user.userId) return res.status(403).json({ success: false, message: "Not authorized" });
  if (request.status !== "pending") return res.status(400).json({ success: false, message: "Request already processed" });

  let match = null;
  if (status === "accepted") {
    await mentorshipService.updateRequest(request.id, { status: "approved" });
    await mentorshipService.rejectOtherPendingRequests(request.studentId, request.id);
    match = await mentorshipService.createMatch({ studentId: request.studentId, mentorId: request.mentorId, requestId: request.id, matchScore: request.matchScore, matchDetails: request.matchDetails });
  } else {
    await mentorshipService.updateRequest(request.id, { status: "rejected" });
  }

  try {
    const student = await userService.findById(request.studentId);
    const alumni = await userService.findById(req.user.userId);
    await notificationService.notifyMentorshipResponse(student, alumni, status, message);
  } catch (err) { console.warn("[respondToMentorshipRequest] notification step failed :", err.message); }

  const io = req.app.get("io");
  if (io) io.to(`user:${request.studentId}`).emit(`connection:${status}`, { connectionId: match ? match.id : request.id, alumniId: req.user.userId, status });

  res.json({ success: true, message: `Mentorship request ${status}`, connection: { _id: match ? match.id : request.id, status, matchScore: request.matchScore, startedAt: match ? toIso(match.startedAt) : undefined } });
};

exports.getActiveMentorships = async (req, res) => {
  let matches;
  if (req.user.role === "student") matches = await mentorshipService.listMatchesForUser(req.user.userId, "student", "active");
  else if (req.user.role === "alumni") matches = await mentorshipService.listMatchesForUser(req.user.userId, "alumni", "active")
  else matches = await mentorshipService.listAllMatches("active"); // admin sees everything

  const students = await Promise.all(matches.map((m) => userService.getFullUser(m.studentId)));
  const alumniUsers = await Promise.all(matches.map((m) => userService.getFullUser(m.mentorId)));

  res.json({ success: true, mentorships: matches.map((m, i) => ({ _id: m.id, status: "accepted", student: formatUserMini(students[i]), alumni: formatUserMini(alumniUsers[i]), matchScore: m.matchScore, startedAt: toIso(m.startedAt), feedback: m.feedback })) });
};

exports.completeMentorship = async (req, res) => {
  const { id } = req.params;
  const { rating, review } = req.body;

  const match = await mentorshipService.findMatchById(id);
  if (!match) return res.status(404).json({ success: false, message: "Connection not found" });
  if (match.status !== "active") return res.status(400).json({ success: false, message: "Only active mentorships can be completed" });

  const feedback = { ...match.feedback };
  if (req.user.role === "student" && match.studentId === req.user.userId) {
    feedback.studentRating = rating; feedback.studentReview = review;
  } else if (req.user.role === "alumni" && match.mentorId === req.user.userId) {
    feedback.alumniRating = rating; feedback.alumniReview = review;
  } else {
    return res.status(403).json({ success: false, message: "Not authorized to complete this mentorship" });
  }

  const patch = { feedback };
  if (feedback.studentRating && feedback.alumniRating) { patch.status = "completed"; patch.completedAt = new Date(); }
  await mentorshipService.updateMatch(match.id, patch);
  const updated = await mentorshipService.findMatchById(match.id);

  res.json({ success: true, message: "Feedback submitted successfully", connection: { _id: updated.id, status: updated.status === "active" ? "accepted" : "completed", feedback: updated.feedback, completedAt: toIso(updated.completedAt) } });
};