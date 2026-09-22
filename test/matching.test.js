const test = require("node:test");
const assert = require("node:assert/strict");
const matching = require("../src/services/matching.service");

test("matching service rewards department and shared skills", () => {
  const student = {
    department: "Information Technology",
    graduationYear: "2028",
  };
  const mentor = {
    department: "Information Technology",
    skills: ["React", "Node.js"],
    interests: ["Mentorship"],
    graduationYear: "2019",
    accountStatus: "active",
  };
  const result = matching.calculateMatchScore(student, mentor, {
    skills: ["React"],
    interests: ["Mentorship"],
  });
  assert.ok(result.matchScore >= 80);
  assert.equal(result.matchDetails.departmentMatch, true);
  assert.deepEqual(result.matchDetails.skillMatches, ["react"]);
});
