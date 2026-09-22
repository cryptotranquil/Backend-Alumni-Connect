const userService = require("../services/userService");
const mentorshipService = require("../services/mentorshipService");
const socialService = require("../services/socialService");
const postService = require("../services/postService");
const formatUser = require("../utils/formatUser");
const { toIso } = require("../utils/serialize");

async function targetUser(req) {
  const id = req.params.id || req.user.userId;
  return userService.getFullUser(id);
}

async function requireTarget(req, res) {
  const user = await targetUser(req);
  if (!user) {
    res.status(404).json({ success: false, message: "User not found" });
    return null;
  }
  return user;
}

exports.getPublicProfile = async (req, res) => {
  const user = await requireTarget(req, res);
  if (user) res.json(formatUser(user));
};

exports.getExperiences = async (req, res) => {
  const user = await requireTarget(req, res);
  if (user) res.json(Array.isArray(user.experiences) ? user.experiences : []);
};

exports.getAchievements = async (req, res) => {
  const user = await requireTarget(req, res);
  if (user) res.json(Array.isArray(user.achievements) ? user.achievements : []);
};

exports.getEducation = async (req, res) => {
  const user = await requireTarget(req, res);
  if (!user) return;
  const match = /^[A-Z]{2,4}\/(\d{2})\/([A-Z]{2})\//i.exec(
    user.registrationNumber || "",
  );
  const campuses = { BT: "Blantyre Campus", LL: "Lilongwe Campus", MZ: "Mzuzu Campus" };
  const startYear = match
    ? String(2000 + Number(match[1]))
    : String((Number(user.graduationYear) || new Date().getFullYear()) - 4);
  res.json([
    {
      _id: `edu-${user.id}`,
      institution: user.university || "Exploits University",
      programme: user.program || user.programme || "",
      department: user.department || "",
      campus: user.campus
        ? campuses[user.campus] || user.campus
        : match
          ? campuses[match[2]] || match[2]
          : "",
      startYear,
      graduationYear: user.graduationYear || "",
      description:
        user.role === "alumni"
          ? "Completed a degree at Exploits University."
          : "Currently studying at Exploits University.",
    },
  ]);
};

exports.getTaggedPosts = async (req, res) => {
  const user = await requireTarget(req, res);
  if (user) res.json(await postService.listTagged(user));
};

exports.getActivity = async (req, res) => {
  const user = await requireTarget(req, res);
  if (!user) return;
  const posts = await postService.list({ authorId: user.id });
  const items = posts.slice(0, 10).map((post) => ({
    _id: `post-${post._id}`,
    type: "post",
    title: "Created a post",
    description: post.text.slice(0, 120),
    timestamp: post.createdAt,
  }));
  if (user.updatedAt) {
    items.push({
      _id: `profile-${user.id}`,
      type: "profile",
      title: "Updated profile",
      description: "Professional profile information was updated.",
      timestamp: toIso(user.updatedAt),
    });
  }
  items.sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp));
  res.json(items);
};

function suggestion(user) {
  return {
    _id: user.id,
    name:
      user.name || `${user.firstname || ""} ${user.lastname || ""}`.trim(),
    profilePhoto: user.profilePhoto || "",
    headline: socialService.headline(user),
    position: user.position || user.jobTitle || "",
    company: user.company || "",
    program: user.program || user.programme || "",
    graduationYear: user.graduationYear || "",
    sharedConnections: 0,
  };
}

exports.getSuggestions = async (req, res) => {
  const user = await requireTarget(req, res);
  if (!user) return;
  const allUsers = (await userService.listFullUsers()).filter(
    (item) =>
      item &&
      item.id !== user.id &&
      item.role !== "admin" &&
      item.accountStatus === "active",
  );
  const similar = allUsers
    .filter(
      (item) => item.department && item.department === user.department,
    )
    .slice(0, 3)
    .map(suggestion);
  res.json({
    peopleYouMayKnow: allUsers.slice(0, 4).map(suggestion),
    similarProfessionals: similar,
  });
};

async function connectionsFor(user) {
  if (user.role === "student") {
    const matches = await mentorshipService.listMatchesForUser(
      user.id,
      "student",
      "active",
    );
    const peers = await Promise.all(
      matches.map((match) => userService.getFullUser(match.mentorId)),
    );
    return peers
      .map((peer, index) =>
        peer
          ? socialService.presence(peer, { since: matches[index].startedAt })
          : null,
      )
      .filter(Boolean);
  }
  if (user.role === "alumni") {
    const matches = await mentorshipService.listMatchesForUser(
      user.id,
      "alumni",
      "active",
    );
    const peers = await Promise.all(
      matches.map((match) => userService.getFullUser(match.studentId)),
    );
    return peers
      .map((peer, index) =>
        peer
          ? socialService.presence(peer, { since: matches[index].startedAt })
          : null,
      )
      .filter(Boolean);
  }
  return [];
}

exports.getConnections = async (req, res) => {
  const user = await requireTarget(req, res);
  if (user) res.json(await connectionsFor(user));
};

exports.getFollowers = async (req, res) => {
  const user = await requireTarget(req, res);
  if (user) res.json(await socialService.listFollowers(user.id));
};

exports.getFollowing = async (req, res) => {
  res.json(await socialService.listFollowing(req.user.userId));
};

exports.getFollowingIds = async (req, res) => {
  res.json({ following: await socialService.getFollowingIds(req.user.userId) });
};

exports.getFollowStatus = async (req, res) => {
  res.json({
    following: await socialService.isFollowing(
      req.user.userId,
      req.params.id,
    ),
  });
};

exports.toggleFollow = async (req, res) => {
  const following = await socialService.toggleFollow(
    req.user.userId,
    req.params.id,
  );
  res.json({ following });
};

exports.getRecommendations = async (req, res) => {
  const user = await requireTarget(req, res);
  if (user) res.json(await socialService.getRecommendations(user.id));
};

exports.addRecommendation = async (req, res) => {
  const relation = String(req.body.relation || "");
  const text = String(req.body.text || "").trim();
  if (!["mentor", "manager", "colleague", "mentee", "peer"].includes(relation)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid recommendation relation" });
  }
  if (text.length < 10 || text.length > 2000) {
    return res.status(400).json({
      success: false,
      message: "Recommendation must be between 10 and 2000 characters",
    });
  }
  res.status(201).json(
    await socialService.addRecommendation({
      targetUserId: req.params.id,
      fromUserId: req.user.userId,
      relation,
      text,
    }),
  );
};

exports.getSkillEndorsements = async (req, res) => {
  const user = await requireTarget(req, res);
  if (!user) return;
  res.json(await socialService.getSkillEndorsements(user.id));
};

exports.endorseSkill = async (req, res) => {
  if (!req.body.skill?.trim()) {
    return res
      .status(400)
      .json({ success: false, message: "Skill is required" });
  }
  res.json(
    await socialService.endorseSkill(
      req.params.id,
      req.user.userId,
      req.body.skill,
    ),
  );
};
