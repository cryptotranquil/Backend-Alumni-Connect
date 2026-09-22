const db = require("../config/firestore");
const userService = require("./userService");

function safeDate(value) {
  const d = value?.toDate ? value.toDate() : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}
async function getAllUsersFiltered({ role, department, isApproved, search }) {
  let users = await userService.listUsers();
  if (role) users = users.filter((u) => u.role === role);
  if (department) users = users.filter((u) => u.department === department);
  if (isApproved !== undefined) {
    const wantActive = isApproved === "true";
    users = users.filter((u) => (u.accountStatus === "active") === wantActive);
  }
  if (search) {
    const q = search.toLowerCase();
    users = users.filter((u) =>
      `${u.firstname || ""} ${u.lastname || ""}`.toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q) ||
      (u.registrationNumber || "").toLowerCase().includes(q)
    );
  }
  return users.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)).slice(0, 100);
}

async function getPendingAlumni() {
  const users = await userService.listUsers();
  return users.filter((u) => u.role === "alumni" && u.accountStatus !== "active");
}

async function getDashboardStats() {
  const [users, jobsSnap, eventsSnap, requestsSnap, matchesSnap] = await Promise.all([
    userService.listUsers(),
    db.collection("jobPosts").get(),
    db.collection("events").get(),
    db.collection("mentorshipRequests").get(),
    db.collection("mentorshipMatches").get(),
  ]);
  const jobs = jobsSnap.docs.map((d) => d.data());
  const events = eventsSnap.docs.map((d) => d.data());
  const requests = requestsSnap.docs.map((d) => d.data());
  const matches = matchesSnap.docs.map((d) => d.data());

  const totalStudents = users.filter((u) => u.role === "student").length;
  const totalAlumni = users.filter((u) => u.role === "alumni" && u.accountStatus === "active").length;
  const pendingAlumni = users.filter((u) => u.role === "alumni" && u.accountStatus !== "active").length;
  const totalAdmins = users.filter((u) => u.role === "admin").length;

  const pendingMentorships = requests.filter((r) => r.status === "pending").length;
  const activeMentorships = matches.filter((m) => m.status === "active").length;
  const completedMentorships = matches.filter((m) => m.status === "completed").length;

  const totalJobs = jobs.length;
  const approvedJobs = jobs.filter((j) => j.status === "approved").length;
  const pendingJobs = jobs.filter((j) => j.status === "pending").length;

  const now = new Date();
  const upcomingEvents = events.filter((e) => {
    const d = safeDate(e.startDate);
    return d && d >= now;
  }).length;

  // Department distribution — this is Phase 3c's saved getDepartmentStats logic,
  // rewritten as a single JS pass instead of a Mongo aggregation pipeline.
  const deptCounts = {};
  users.filter((u) => ["student", "alumni"].includes(u.role) && u.department).forEach((u) => {
    deptCounts[u.department] = deptCounts[u.department] || { department: u.department, students: 0, alumni: 0, total: 0 };
    if (u.role === "student") deptCounts[u.department].students++;
    if (u.role === "alumni") deptCounts[u.department].alumni++;
    deptCounts[u.department].total++;
  });
  const departmentDistribution = Object.values(deptCounts)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)
    .map((item) => ({ _id: item.department, count: item.total }));

  const monthCounts = {};
  users.forEach((u) => {
  const d = safeDate(u.createdAt);
  if (!d) return; // skip users with missing/invalid createdAt rather than crashing
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  monthCounts[key] = (monthCounts[key] || 0) + 1;
});
  const monthlyRegistrations = Object.entries(monthCounts).sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([month, registrations]) => ({ month, registrations }));

  const usersById = Object.fromEntries(users.map((u) => [u.id, u]));
  const deptMentorCounts = {};
  matches.filter((m) => m.status === "active" || m.status === "completed").forEach((m) => {
    const dept = usersById[m.studentId]?.department || "Not Specified";
    deptMentorCounts[dept] = (deptMentorCounts[dept] || 0) + 1;
  });
  const mentorshipByDepartment = Object.entries(deptMentorCounts).sort(([, a], [, b]) => b - a).map(([_id, count]) => ({ _id, count }));

  const dayCounts = {};
  users.forEach((u) => {
  const d = safeDate(u.createdAt);
  if (!d) return;
  const key = `${d.toISOString().split("T")[0]}|${u.role}`;
  dayCounts[key] = (dayCounts[key] || 0) + 1;
});
  const userGrowth = Object.entries(dayCounts)
    .map(([key, count]) => {
      const [date, role] = key.split("|");
      return { _id: { date, role }, count };
    })
    .sort((a, b) => b._id.date.localeCompare(a._id.date))
    .slice(0, 30);

  return {
    users: { total: users.length, students: totalStudents, alumni: totalAlumni, pendingAlumni, admins: totalAdmins },
    mentorship: { total: activeMentorships + completedMentorships, pending: pendingMentorships, completed: completedMentorships, active: activeMentorships },
    jobs: { total: totalJobs, active: approvedJobs, pending: pendingJobs },
    events: { total: events.length, upcoming: upcomingEvents },
    charts: { departmentDistribution, monthlyRegistrations, mentorshipByDepartment, userGrowth },
  };
}

async function getMentorshipAnalytics() {
  const [requestsSnap, matchesSnap] = await Promise.all([db.collection("mentorshipRequests").get(), db.collection("mentorshipMatches").get()]);
  const requests = requestsSnap.docs.map((d) => d.data());
  const matches = matchesSnap.docs.map((d) => d.data());
  const users = await userService.listUsers();
  const usersById = Object.fromEntries(users.map((u) => [u.id, u]));

  const byStatus = {};
  const addToStatus = (status, matchScore) => {
    if (!byStatus[status]) byStatus[status] = { _id: status, count: 0, scoreSum: 0, scoreCount: 0 };
    byStatus[status].count++;
    if (typeof matchScore === "number") { byStatus[status].scoreSum += matchScore; byStatus[status].scoreCount++; }
  };
  requests.forEach((r) => addToStatus(r.status, r.matchScore));
  matches.forEach((m) => addToStatus(m.status, m.matchScore));
  const analytics = Object.values(byStatus).map((s) => ({ _id: s._id, count: s.count, avgMatchScore: s.scoreCount ? Math.round(s.scoreSum / s.scoreCount) : null }));

  const menteeCounts = {};
  matches.forEach((m) => { menteeCounts[m.mentorId] = (menteeCounts[m.mentorId] || 0) + 1; });
  const topMentors = Object.entries(menteeCounts).sort(([, a], [, b]) => b - a).slice(0, 10)
    .map(([mentorId, menteeCount]) => {
      const mentor = usersById[mentorId];
      return { name: mentor ? `${mentor.firstname || ""} ${mentor.lastname || ""}`.trim() : "Unknown", department: mentor?.department, menteeCount };
    });

  return { analytics, topMentors };
}

module.exports = { getAllUsersFiltered, getPendingAlumni, getDashboardStats, getMentorshipAnalytics };