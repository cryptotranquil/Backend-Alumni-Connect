const userService = require("../services/userService");
const mentorshipService = require("../services/mentorshipService");
const notificationService = require("../services/notification.service");

function directoryUser(user) {
  return {
    _id: user.id,
    name:
      user.name || `${user.firstname || ""} ${user.lastname || ""}`.trim(),
    email: user.email,
    profilePhoto: user.profilePhoto || "",
    graduationYear: user.graduationYear || "",
    company: user.company || "",
    position: user.position || user.jobTitle || "",
    department: user.department || "",
    program: user.program || user.programme || "",
    location: user.location || "",
    role: user.role,
    bio: user.bio || "",
    skills: user.skills || [],
  };
}

function overlap(left = [], right = []) {
  const rightSet = new Set(right.map((item) => item.toLowerCase()));
  return left.filter((item) => rightSet.has(item.toLowerCase()));
}

function hash(value) {
  let result = 0;
  for (const char of value) result = (result * 31 + char.charCodeAt(0)) >>> 0;
  return result;
}

function scorePair(student, mentor) {
  let score = 15;
  const reasons = [];
  if (student.department && student.department === mentor.department) {
    score += 35;
    reasons.push(`Same department — ${mentor.department}`);
  }
  if (
    (student.program || student.programme) &&
    (student.program || student.programme) === (mentor.program || mentor.programme)
  ) {
    score += 15;
    reasons.push("Completed your programme");
  }
  const sharedSkills = overlap(student.skills, mentor.skills);
  if (sharedSkills.length) {
    score += Math.min(sharedSkills.length * 10, 30);
    reasons.push(`Shares skills like ${sharedSkills.slice(0, 3).join(", ")}`);
  }
  const sharedInterests = overlap(student.interests, mentor.interests);
  if (sharedInterests.length) {
    score += Math.min(sharedInterests.length * 5, 10);
    reasons.push(`Shared interests: ${sharedInterests.slice(0, 2).join(", ")}`);
  }
  if (reasons.length === 0) reasons.push("Exploits University alumni mentor");
  return { score: Math.min(score, 98), reasons, sharedSkills };
}

exports.getMentorMatches = async (req, res) => {
  if (req.user.role !== "student") {
    return res.status(403).json({ success: false, message: "Students only" });
  }
  const student = await userService.getFullUser(req.user.userId);
  const users = await userService.listFullUsers();
  const matches = users
    .filter(
      (user) =>
        user.role === "alumni" && user.accountStatus === "active",
    )
    .map((mentor) => {
      const match = scorePair(student, mentor);
      return {
        mentor: directoryUser(mentor),
        matchScore: match.score,
        matchReasons: match.reasons,
        availability: mentor.mentorAvailable !== false,
        responseRate: `${80 + (hash(mentor.id) % 19)}%`,
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 9);
  res.json(matches);
};

exports.getMenteeMatches = async (req, res) => {
  if (req.user.role !== "alumni") {
    return res.status(403).json({ success: false, message: "Alumni only" });
  }
  const mentor = await userService.getFullUser(req.user.userId);
  const users = await userService.listFullUsers();
  const matches = users
    .filter((user) => user.role === "student" && user.accountStatus === "active")
    .map((student) => {
      const match = scorePair(student, mentor);
      const matchedOn = [...match.reasons];
      return {
        student: directoryUser(student),
        matchScore: match.score,
        interests:
          student.interests?.length > 0
            ? student.interests.slice(0, 3)
            : ["Career guidance", "CV review"],
        matchedOn,
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 9);
  res.json(matches);
};

exports.requestMentorship = async (req, res) => {
  if (req.user.role !== "student") {
    return res.status(403).json({ success: false, message: "Students only" });
  }
  const mentorId = req.body.mentorId;
  const mentor = await userService.getFullUser(mentorId);
  if (!mentor || mentor.role !== "alumni" || mentor.accountStatus !== "active") {
    return res.status(404).json({ success: false, message: "Mentor not found" });
  }
  const existing = await mentorshipService.findRequestBetween(
    req.user.userId,
    mentorId,
  );
  if (!existing || existing.status !== "pending") {
    const student = await userService.getFullUser(req.user.userId);
    const scored = scorePair(student, mentor);
    await mentorshipService.createRequest({
      studentId: req.user.userId,
      mentorId,
      initiatedBy: req.user.userId,
      skillsRequested: student.skills || [],
      interests: student.interests || [],
      matchScore: scored.score,
      message: "",
    });
    try {
      await notificationService.notifyMentorshipRequest(
        student,
        mentor,
        scored.score,
        "",
      );
    } catch (error) {
      console.warn("[requestMentorship] notification failed:", error.message);
    }
  }
  res.status(201).json({ success: true });
};

exports.offerMentorship = async (req, res) => {
  if (req.user.role !== "alumni") {
    return res.status(403).json({ success: false, message: "Alumni only" });
  }
  const student = await userService.findById(req.body.studentId);
  if (!student || student.role !== "student") {
    return res.status(404).json({ success: false, message: "Student not found" });
  }
  await mentorshipService.createOffer(req.user.userId, student.id);
  res.status(201).json({ success: true });
};

exports.getState = async (req, res) => {
  if (req.user.role === "student") {
    const requests = await mentorshipService.listRequestsByStudent(
      req.user.userId,
    );
    return res.json({
      requestSent: requests
        .filter((request) => request.status === "pending")
        .map((request) => request.mentorId),
      offered: [],
    });
  }
  if (req.user.role === "alumni") {
    const offers = await mentorshipService.listOffersByMentor(req.user.userId);
    return res.json({
      requestSent: [],
      offered: offers
        .filter((offer) => offer.status === "pending")
        .map((offer) => offer.studentId),
    });
  }
  res.json({ requestSent: [], offered: [] });
};
