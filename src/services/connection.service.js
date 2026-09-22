const userService = require("./userService");
const mentorshipService = require("./mentorshipService");

async function canExchangeMessages(userIdA, userIdB) {
  if (!userIdA || !userIdB || userIdA === userIdB) return false;

  const [a, b] = await Promise.all([userService.findById(userIdA), userService.findById(userIdB)]);
  if (!a || !b) return false;
  if (a.role === "admin" || b.role === "admin") return true;
  if (a.role === "student" && b.role === "student") return false;
  if (a.role === "alumni" && b.role === "alumni") return true;

  const student = a.role === "student" ? a : b.role === "student" ? b : null;
  const alumni = a.role === "alumni" ? a : b.role === "alumni" ? b : null;
  if (!student || !alumni) return false;

  const match = await mentorshipService.findMatchBetween(student.id, alumni.id);
  return !!match;
}

module.exports = { canExchangeMessages };