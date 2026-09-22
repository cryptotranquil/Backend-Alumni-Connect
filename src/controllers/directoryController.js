const userService = require("../services/userService");

const nameOf = (u) => u?.name || `${u?.firstname || ""} ${u?.lastname || ""}`.trim();

/**
 * Mongo's version used $regex/$or directly in the query for partial,
 * case-insensitive matching. Firestore has no equivalent, so this fetches
 * the role-scoped candidate set — using getFullUser to pull in
 * profiles-collection fields like bio/skills/company/jobTitle — and filters
 * in memory instead. Same tradeoff already accepted in
 * getMatchingSuggestions and adminService's getAllUsersFiltered. Fine at
 * the current data scale; would need a real search index at real scale.
 */
async function getFullCandidates(role) {
  const baseUsers = await userService.listUsers();
  const filtered = baseUsers.filter((u) => u.role === role);
  return Promise.all(filtered.map((u) => userService.getFullUser(u.id)));
}

const toPublicShape = (u) => ({
  _id: u.id,
  name: nameOf(u),
  email: u.email,
  profilePhoto: u.profilePhoto || "",
  graduationYear: u.graduationYear || "",
  company: u.company || "",
  position: u.jobTitle || u.position || "", // profiles collection uses "jobTitle" — confirmed during Phase 3d
  department: u.department || "",
  program: u.program || u.programme || "",
  location: u.location || "",
  role: u.role,
  bio: u.bio || "",
  skills: u.skills || [],
});

exports.listAlumni = async (req, res) => {
  const { department, skills, location, search } = req.query;

  let alumni = (await getFullCandidates("alumni")).filter(
    (u) => u.accountStatus === "active" && u.id !== req.user.userId,
  );

  if (department && department !== "all") {
    const term = department.toLowerCase();
    alumni = alumni.filter((u) => (u.department || "").toLowerCase().includes(term));
  }

  if (skills && skills !== "all") {
    const terms = skills.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    alumni = alumni.filter((u) =>
      (u.skills || []).some((s) => terms.some((t) => s.toLowerCase().includes(t))),
    );
  }

  if (location && location !== "all") {
    const term = location.toLowerCase();
    alumni = alumni.filter(
      (u) =>
        (u.location || "").toLowerCase().includes(term) ||
        (u.company || "").toLowerCase().includes(term) ||
        (u.bio || "").toLowerCase().includes(term),
    );
  }

  if (search && search.trim()) {
    const term = search.trim().toLowerCase();
    alumni = alumni.filter(
      (u) =>
        nameOf(u).toLowerCase().includes(term) ||
        (u.company || "").toLowerCase().includes(term) ||
        (u.jobTitle || u.position || "").toLowerCase().includes(term) ||
        (u.skills || []).some((s) => s.toLowerCase().includes(term)),
    );
  }

  alumni.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));

  res.json({
    success: true,
    count: alumni.length,
    alumni: alumni.map(toPublicShape),
  });
};

exports.listStudents = async (req, res) => {
  const { department, skills, search } = req.query;

  let students = (await getFullCandidates("student")).filter((u) => u.id !== req.user.userId);

  if (department && department !== "all") {
    const term = department.toLowerCase();
    students = students.filter((u) => (u.department || "").toLowerCase().includes(term));
  }

  if (skills && skills !== "all") {
    const terms = skills.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    students = students.filter((u) =>
      (u.skills || []).some((s) => terms.some((t) => s.toLowerCase().includes(t))),
    );
  }

  if (search && search.trim()) {
    const term = search.trim().toLowerCase();
    students = students.filter(
      (u) =>
        nameOf(u).toLowerCase().includes(term) ||
        (u.skills || []).some((s) => s.toLowerCase().includes(term)),
    );
  }

  students.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));

  res.json({
    success: true,
    count: students.length,
    students: students.map(toPublicShape),
  });
};

exports.getFilterOptions = async (req, res) => {
  const alumni = (await getFullCandidates("alumni")).filter((u) => u.accountStatus === "active");

  const departments = [...new Set(alumni.map((a) => a.department).filter(Boolean))];
  const skills = [...new Set(alumni.flatMap((a) => a.skills || []))].sort();
  const locations = [...new Set(alumni.map((a) => a.location || a.company).filter(Boolean))];

  res.json({
    success: true,
    filters: { departments, skills, locations },
  });
};