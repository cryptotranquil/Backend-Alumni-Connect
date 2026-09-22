/**
 * Matching Algorithm Service
 * Matches students with alumni based on department, skills, interests, and career goals
 */

/**
 * Profile fields such as skills, interests and careerGoals are free-form in
 * Firestore: they can be an array, a comma-separated string, or missing.
 * Always hand the scoring code a clean array of non-empty strings.
 */
const toList = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
};

class MatchingService {
  /**
   * Calculate match score between a student and an alumni
   */
  calculateMatchScore(student, alumni, mentorshipRequest) {
    let totalScore = 0;
    const matchDetails = {
      departmentMatch: false,
      skillMatches: [],
      interestMatches: [],
      industryMatch: false,
    };

    // 1. Department Match (30 points)
    if (student.department && alumni.department) {
      if (student.department === alumni.department) {
        matchDetails.departmentMatch = true;
        totalScore += 30;
      }
    }

    // 2. Skills Match (25 points)
    const requestedSkills = toList(mentorshipRequest.skills).map((s) => s.toLowerCase());
    const alumniSkills = toList(alumni.skills).map((s) => s.toLowerCase());
    if (requestedSkills.length > 0 && alumniSkills.length > 0) {
      const matchedSkills = requestedSkills.filter((skill) =>
        alumniSkills.includes(skill),
      );

      matchDetails.skillMatches = matchedSkills;

      if (matchedSkills.length > 0) {
        const skillMatchPercentage = matchedSkills.length / requestedSkills.length;
        totalScore += Math.min(25, skillMatchPercentage * 25);
      }
    }

    // 3. Interests Match (20 points)
    const requestedInterests = toList(mentorshipRequest.interests).map((i) => i.toLowerCase());
    const alumniInterests = toList(alumni.interests).map((i) => i.toLowerCase());
    if (requestedInterests.length > 0 && alumniInterests.length > 0) {
      const matchedInterests = requestedInterests.filter((interest) =>
        alumniInterests.includes(interest),
      );

      matchDetails.interestMatches = matchedInterests;

      if (matchedInterests.length > 0) {
        const interestMatchPercentage =
          matchedInterests.length / requestedInterests.length;
        totalScore += Math.min(20, interestMatchPercentage * 20);
      }
    }

    // 4. Industry Match (15 points)
    if (
      mentorshipRequest.preferredIndustry &&
      (alumni.position || alumni.company)
    ) {
      const industryKeywords = mentorshipRequest.preferredIndustry
        .toLowerCase()
        .split(" ")
        .filter((k) => k.length > 3);
      const alumniProfile =
        `${alumni.position || ""} ${alumni.company || ""} ${alumni.bio || ""}`.toLowerCase();

      const hasIndustryMatch = industryKeywords.some((keyword) =>
        alumniProfile.includes(keyword),
      );

      if (hasIndustryMatch) {
        matchDetails.industryMatch = true;
        totalScore += 15;
      }
    }

    // 5. Experience Level (10 points)
    if (alumni.graduationYear) {
      const currentYear = new Date().getFullYear();
      const yearsOfExperience = currentYear - parseInt(alumni.graduationYear);

      if (yearsOfExperience >= 5) {
        totalScore += 10;
      } else if (yearsOfExperience >= 2) {
        totalScore += 7;
      } else if (yearsOfExperience >= 1) {
        totalScore += 4;
      }
    }

    return {
      matchScore: Math.round(totalScore),
      matchDetails,
    };
  }

  /**
   * Find best matches for a student
   */
  findBestMatches(alumniList, student, mentorshipRequest) {
    const matches = [];

    for (const alumni of alumniList) {
      if (alumni.accountStatus !== "active") continue;

      const { matchScore, matchDetails } = this.calculateMatchScore(
        student,
        alumni,
        mentorshipRequest,
      );

      matches.push({
        alumniId: alumni.id,
        alumni: {
          _id: alumni.id, // key kept as `_id` here for output-shape compatibility with the frontend
          name: `${alumni.firstname || ""} ${alumni.lastname || ""}`.trim(),
          email: alumni.email,
          profilePhoto: alumni.profilePhoto,
          department: alumni.department,
          graduationYear: alumni.graduationYear,
          position: alumni.position,
          company: alumni.company,
          skills: alumni.skills,
          interests: alumni.interests,
          bio: alumni.bio,
        },
        matchScore,
        matchDetails,
      });
    }

    return matches.sort((a, b) => b.matchScore - a.matchScore);
  }

  getMatchThreshold() {
    return 40;
  }

  filterMatchesByThreshold(matches) {
    const threshold = this.getMatchThreshold();
    return matches.filter((match) => match.matchScore >= threshold);
  }
}

module.exports = new MatchingService();