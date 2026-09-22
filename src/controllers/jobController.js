const jobService = require("../services/jobService");
const userService = require("../services/userService");
const notificationService = require("../services/notification.service");
const { serialize, toIso } = require("../utils/serialize");

function nameOf(user) {
  return (
    user?.name || `${user?.firstname || ""} ${user?.lastname || ""}`.trim()
  );
}

function formatJob(job, poster) {
  if (!job) return null;
  return serialize({
    _id: job.id,
    title: job.title,
    company: job.company,
    location: job.location || "",
    description: job.description,
    requirements: job.requirements || [],
    salary: job.salary || "",
    deadline: job.deadline || "",
    contactEmail: job.contactEmail || "",
    type: job.type || "full-time",
    postedBy: {
      _id: poster?.id || job.postedBy,
      name: nameOf(poster) || "Member",
      profilePhoto: poster?.profilePhoto || "",
    },
    status: job.status,
    applicants: job.applicants || [],
    createdAt: job.createdAt,
  });
}

exports.listJobs = async (req, res) => {
  const { search, type, location } = req.query;
  let jobs = await jobService.listForUser(req.user.role, req.user.userId);
  if (search?.trim()) {
    const term = search.trim().toLowerCase();
    jobs = jobs.filter((job) =>
      [job.title, job.company, job.description].some((field) =>
        String(field || "").toLowerCase().includes(term),
      ),
    );
  }
  if (type && type !== "all") jobs = jobs.filter((job) => job.type === type);
  if (location && location !== "all") {
    jobs = jobs.filter((job) =>
      String(job.location || "").toLowerCase().includes(location.toLowerCase()),
    );
  }
  const posters = await Promise.all(
    jobs.map((job) => userService.findById(job.postedBy)),
  );
  res.json({
    success: true,
    jobs: jobs.map((job, index) => formatJob(job, posters[index])),
  });
};

exports.createJob = async (req, res) => {
  const {
    title,
    company,
    location,
    description,
    requirements,
    type,
    salary,
    deadline,
    contactEmail,
  } = req.body;
  const status = req.user.role === "admin" ? "approved" : "pending";
  const job = await jobService.createJob({
    title: title.trim(),
    company: company.trim(),
    location: location?.trim() || "",
    description: description.trim(),
    requirements: Array.isArray(requirements) ? requirements : [],
    type: type || "full-time",
    salary: salary?.trim() || "",
    deadline: deadline || "",
    contactEmail: contactEmail?.trim() || "",
    postedBy: req.user.userId,
    status,
  });
  const poster = await userService.findById(req.user.userId);
  // createJobApi expects the Job directly.
  res.status(201).json(formatJob(job, poster));
};

exports.updateJob = async (req, res) => {
  const job = await jobService.findById(req.params.id);
  if (!job) {
    return res
      .status(404)
      .json({ success: false, message: "Job not found" });
  }
  if (job.postedBy !== req.user.userId && req.user.role !== "admin") {
    return res.status(403).json({ success: false, message: "Not allowed" });
  }

  const fields = [
    "title",
    "company",
    "location",
    "description",
    "requirements",
    "type",
    "salary",
    "deadline",
    "contactEmail",
  ];
  const patch = {};
  fields.forEach((field) => {
    if (req.body[field] !== undefined) {
      patch[field] =
        typeof req.body[field] === "string"
          ? req.body[field].trim()
          : req.body[field];
    }
  });
  if (req.user.role !== "admin") patch.status = "pending";
  await jobService.updateJob(job.id, patch);
  const updated = await jobService.findById(job.id);
  const poster = await userService.findById(updated.postedBy);
  res.json(formatJob(updated, poster));
};

exports.deleteJob = async (req, res) => {
  const job = await jobService.findById(req.params.id);
  if (!job) {
    return res
      .status(404)
      .json({ success: false, message: "Job not found" });
  }
  if (job.postedBy !== req.user.userId && req.user.role !== "admin") {
    return res.status(403).json({ success: false, message: "Not allowed" });
  }
  await jobService.deleteJob(job.id);
  res.json({ success: true, message: "Job deleted" });
};

exports.applyJob = async (req, res) => {
  if (req.user.role !== "student") {
    return res
      .status(403)
      .json({ success: false, message: "Only students can apply" });
  }
  const job = await jobService.findById(req.params.id);
  if (!job || job.status !== "approved") {
    return res.status(404).json({
      success: false,
      message: "Job not found or not open",
    });
  }
  if ((job.applicants || []).includes(req.user.userId)) {
    return res.json({ success: true, message: "Already applied" });
  }
  await jobService.addApplicant(job.id, req.user.userId);
  try {
    const [student, poster] = await Promise.all([
      userService.findById(req.user.userId),
      userService.findById(job.postedBy),
    ]);
    if (poster) await notificationService.notifyJobApplication(job, student, poster);
  } catch (error) {
    console.warn("[applyJob] notification failed:", error.message);
  }
  res.json({ success: true, message: "Application submitted" });
};

exports.approveJob = async (req, res) => {
  const job = await jobService.findById(req.params.id);
  if (!job) {
    return res
      .status(404)
      .json({ success: false, message: "Job not found" });
  }
  await jobService.updateJob(job.id, { status: "approved" });
  const updated = await jobService.findById(job.id);
  const poster = await userService.findById(updated.postedBy);
  try {
    if (poster) {
      await notificationService.createNotification({
        userId: poster.id,
        type: "job_approved",
        title: "Your Job Posting is Approved!",
        message: `Your job "${updated.title}" is now visible to students.`,
        data: { jobId: updated.id, jobTitle: updated.title },
        actionUrl: "/jobs",
        sendEmail: true,
        emailRecipient: poster.email,
      });
    }
  } catch (error) {
    console.warn("[approveJob] notification failed:", error.message);
  }
  res.json({ success: true, job: formatJob(updated, poster) });
};

exports.getJobStats = async (req, res) => {
  const totalAvailable = await jobService.countByStatus("approved");
  const applied = await jobService.countAppliedByUser(req.user.userId);
  res.json({
    success: true,
    stats: {
      totalAvailable,
      applied,
      remaining: Math.max(0, totalAvailable - applied),
    },
  });
};

exports.getJobFilters = async (_req, res) => {
  const jobs = await jobService.listApproved();
  res.json({
    success: true,
    filters: {
      types: [...new Set(jobs.map((job) => job.type).filter(Boolean))],
      locations: [...new Set(jobs.map((job) => job.location).filter(Boolean))],
    },
  });
};

exports.referStudent = async (req, res) => {
  if (!['alumni', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: "Only alumni can make referrals" });
  }
  const [job, student] = await Promise.all([
    jobService.findById(req.params.id),
    userService.findById(req.body.studentId),
  ]);
  if (!job) return res.status(404).json({ success: false, message: "Job not found" });
  if (!student || student.role !== "student") {
    return res.status(404).json({ success: false, message: "Student not found" });
  }
  const referral = await jobService.createReferral({
    jobId: job.id,
    studentId: student.id,
    referrerId: req.user.userId,
    note: String(req.body.note || "").trim(),
  });
  try {
    await notificationService.createNotification({
      userId: student.id,
      type: "system",
      title: `Job referral: ${job.title}`,
      message: `An alumnus referred you for ${job.title} at ${job.company}.`,
      data: { jobId: job.id, jobTitle: job.title, referrerId: req.user.userId },
      actionUrl: "/jobs",
      sendEmail: true,
      emailRecipient: student.email,
    });
  } catch (error) {
    console.warn("[referStudent] notification failed:", error.message);
  }
  res.status(201).json({
    jobId: referral.jobId,
    studentId: referral.studentId,
    note: referral.note,
    referrerId: referral.referrerId,
    createdAt: toIso(referral.createdAt),
  });
};

exports.referralStatus = async (req, res) => {
  res.json({
    referred: await jobService.hasReferral(req.params.id, req.user.userId),
  });
};
