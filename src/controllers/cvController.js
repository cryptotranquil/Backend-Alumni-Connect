const userService = require("../services/userService");
const formatUser = require("../utils/formatUser");

const nameOf = (u) => u?.name || `${u?.firstname || ""} ${u?.lastname || ""}`.trim();

// ── Upload CV ─────────────────────────────────────────────────────────────────
exports.uploadCV = async (req, res) => {
  if (!req.file) {
    return res
      .status(400)
      .json({ success: false, message: "No file uploaded." });
  }
  const cvUrl = req.file.path;
  await userService.updateUser(req.user.userId, { cvUrl });
  const user = await userService.findById(req.user.userId);
  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }
  res.json({ success: true, cvUrl, user: formatUser(user) });
};

// ── View CV ───────────────────────────────────────────────────────────────────
// Uploaded as resource_type "image" + format "pdf" — Cloudinary serves these
// freely on free plan (unlike "raw" which is blocked for untrusted accounts).
// We still proxy through backend so browser auth flow stays clean.
exports.viewCV = async (req, res) => {
  const user = await userService.findById(req.user.userId);
  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }
  if (!user.cvUrl) {
    return res
      .status(404)
      .json({ success: false, message: "No CV uploaded yet." });
  }

  const upstream = await fetch(user.cvUrl);

  if (!upstream.ok) {
    const errText = await upstream.text();
    console.error("[cvController.viewCV] Error:", upstream.status, errText);
    return res.status(upstream.status).json({
      success: false,
      message: "Could not retrieve CV from storage.",
    });
  }

  const filename = `${(nameOf(user) || "resume").replace(/\s+/g, "_")}_CV.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  res.setHeader("Cache-Control", "no-store");

  const bytes = Buffer.from(await upstream.arrayBuffer());
  res.send(bytes);
};