const userService = require("../services/userService");
const { parseRegistrationNumber } = require("../utils/registrationNumber");

// Canonical form of a registration number, or "" when it is not a valid one.
const canonicalNumber = (value) => parseRegistrationNumber(value)?.normalized || "";
const jobService = require("../services/jobService");
const eventService = require("../services/eventService");
const mentorshipService = require("../services/mentorshipService");
const formatUser = require("../utils/formatUser");
const { serialize, toIso } = require("../utils/serialize");
const { canExchangeMessages } = require("../services/connection.service");

exports.getPublicPeer = async (req, res) => {
  const { id } = req.params;
  const allowed = await canExchangeMessages(req.user.userId, id);
  if (!allowed) {
    return res.status(403).json({
      success: false,
      message: "You are not allowed to message this user yet.",
    });
  }
  const peer = await userService.getFullUser(id);
  if (!peer) {
    return res
      .status(404)
      .json({ success: false, message: "User not found" });
  }
  res.json({
    _id: peer.id,
    name:
      peer.name || `${peer.firstname || ""} ${peer.lastname || ""}`.trim(),
    profilePhoto: peer.profilePhoto || "",
    role: peer.role,
  });
};

exports.listUsers = async (_req, res) => {
  const users = await userService.listFullUsers();
  res.json({ success: true, users: users.map(formatUser) });
};

exports.getProfile = async (req, res) => {
  const user = await userService.getFullUser(req.user.userId);
  if (!user) {
    return res
      .status(404)
      .json({ success: false, message: "User not found" });
  }
  // The frontend's getProfileApi expects the User itself, not an envelope.
  res.json(formatUser(user));
};

exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await userService.findById(req.user.userId);
  if (!user) {
    return res
      .status(404)
      .json({ success: false, message: "User not found" });
  }

  if (!user.mustChangePassword) {
    if (!currentPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password is required.",
      });
    }
    if (!(await userService.matchPassword(currentPassword, user.password))) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect.",
      });
    }
  }

  await userService.updateUser(req.user.userId, {
    password: newPassword,
    mustChangePassword: false,
    passwordResetTokenHash: null,
    passwordResetExpires: null,
    // Invalidate any session token issued before this change (including,
    // deliberately, the one making this very request — the frontend already
    // gets a fresh token back from other flows and can re-login here).
    tokenVersion: (user.tokenVersion || 0) + 1,
  });
  const updatedUser = await userService.getFullUser(req.user.userId);
  res.json({
    success: true,
    message: "Password updated.",
    user: formatUser(updatedUser),
  });
};

const EDITABLE_PROFILE_FIELDS = [
  "phone",
  "graduationYear",
  "university",
  "company",
  "position",
  "profilePhoto",
  "coverPhoto",
  "skills",
  "interests",
  "department",
  "location",
  "bio",
  "cvUrl",
  "registrationNumber",
  "program",
  "headline",
  "website",
  "industry",
  "yearsOfExperience",
  "careerGoals",
  "experiences",
  "achievements",
];

exports.updateProfile = async (req, res) => {
  const updates = {};
  for (const key of EDITABLE_PROFILE_FIELDS) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  if (req.body.name !== undefined) {
    const [firstname, ...rest] = req.body.name.trim().split(/\s+/);
    updates.firstname = firstname;
    updates.lastname = rest.join(" ");
  }

  // An alumnus's registration number is what got them approved, so once it is
  // set it is fixed. (Sending the same value back is fine.)
  if (
    updates.registrationNumber &&
    req.user.role === "alumni" &&
    req.user.doc?.registrationNumber
  ) {
    const current = canonicalNumber(req.user.doc.registrationNumber);
    const requested = canonicalNumber(updates.registrationNumber);
    if (requested !== current) {
      return res.status(400).json({
        success: false,
        message:
          "Your registration number can't be changed. Contact an administrator if it is wrong.",
      });
    }
    delete updates.registrationNumber;
  }

  if (updates.registrationNumber) {
    const existing = await userService.findByRegistrationNumber(
      updates.registrationNumber,
    );
    if (existing && existing.id !== req.user.userId) {
      return res.status(409).json({
        success: false,
        message: "That registration number is already in use",
      });
    }
  }

  await userService.updateUser(req.user.userId, updates);
  const user = await userService.getFullUser(req.user.userId);
  if (!user) {
    return res
      .status(404)
      .json({ success: false, message: "User not found" });
  }
  res.json(formatUser(user));
};

exports.uploadPhoto = async (req, res) => {
  if (!req.file) {
    return res
      .status(400)
      .json({ success: false, message: "No file uploaded." });
  }
  const profilePhoto = req.file.path;
  await userService.updateUser(req.user.userId, { profilePhoto });
  const user = await userService.getFullUser(req.user.userId);
  res.json({ profilePhoto, user: formatUser(user) });
};

exports.uploadMedia = async (req, res) => {
  const photo = req.files?.photo?.[0];
  const cover = req.files?.cover?.[0];
  const file = photo || cover;
  if (!file) {
    return res
      .status(400)
      .json({ success: false, message: "No image uploaded." });
  }
  const field = cover ? "coverPhoto" : "profilePhoto";
  await userService.updateUser(req.user.userId, { [field]: file.path });
  const user = await userService.getFullUser(req.user.userId);
  res.json({ [field]: file.path, user: formatUser(user) });
};

exports.getProfileStats = async (req, res) => {
  const userId = req.user.userId;
  const user = await userService.findById(userId);

  const applied = await jobService.listAppliedByUser(userId);
  const appliedJobs = applied.map((job) => ({
    _id: job.id,
    title: job.title,
    company: job.company,
    location: job.location || "",
    type: job.type || "full-time",
    status: job.status,
    createdAt: toIso(job.createdAt),
  }));

  let matches = [];
  let peerField = "";
  if (user?.role === "student") {
    matches = await mentorshipService.listMatchesForUser(
      userId,
      "student",
      "active",
    );
    peerField = "mentorId";
  } else if (user?.role === "alumni") {
    matches = await mentorshipService.listMatchesForUser(
      userId,
      "alumni",
      "active",
    );
    peerField = "studentId";
  }
  const peers = await Promise.all(
    matches.map((match) => userService.getFullUser(match[peerField])),
  );
  const connectionsList = peers.filter(Boolean).map((peer) => ({
    _id: peer.id,
    name:
      peer.name || `${peer.firstname || ""} ${peer.lastname || ""}`.trim(),
    email: peer.email,
    photo: peer.profilePhoto || "",
    company: peer.company || "",
    position: peer.position || peer.jobTitle || "",
    graduationYear: peer.graduationYear || "",
    university: peer.university || "Exploits University",
  }));

  const events = await eventService.listEventsForUser(userId);
  const organizers = await Promise.all(
    events.map((event) => userService.findById(event.createdBy)),
  );
  const eventsList = events.map((event, index) => ({
    _id: event.id,
    title: event.title,
    description: event.description || "",
    eventDate: toIso(event.startDate),
    location: event.location || "",
    organizer: organizers[index]
      ? `${organizers[index].firstname || ""} ${organizers[index].lastname || ""}`.trim()
      : "Exploits University",
  }));

  res.json(
    serialize({
      jobsApplied: appliedJobs.length,
      appliedJobs,
      connectionsCount: connectionsList.length,
      connectionsList,
      eventsJoined: eventsList.length,
      eventsList,
    }),
  );
};
