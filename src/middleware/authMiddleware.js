const { verifySessionToken } = require("../utils/generateToken");
const userService = require("../services/userService");
const formatUser = require("../utils/formatUser");

const authenticate = async (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");
    if (!token) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const decoded = verifySessionToken(token);
    const user = await userService.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ success: false, message: "User not found" });
    }
    if (user.accountStatus === "disabled") {
      return res.status(401).json({ success: false, message: "Invalid token" });
    }
    if ((decoded.v || 0) !== (user.tokenVersion || 0)) {
      // Password changed/reset or the user logged out elsewhere: this token
      // was issued before that and must stop working immediately, not just
      // at its original 10-minute expiry.
      return res.status(401).json({ success: false, message: "Token expired" });
    }

    req.user = {
      userId: user.id,
      email: user.email,
      role: user.role,
      isApproved:
        user.accountStatus === "active" || user.isApproved === true,
      doc: user, // plain object now, not a Mongoose doc — no .toObject()/instance methods available
    };
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ success: false, message: "Invalid token" });
    }
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ success: false, message: "Token expired" });
    }
    console.error("Authentication error:", error);
    return res.status(500).json({ success: false, message: "Authentication failed" });
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: "Authentication required" });
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: "Insufficient permissions" });
  }
  next();
};

const requireApprovedAlumni = (req, res, next) => {
  if (req.user.role === "alumni" && !req.user.isApproved) {
    return res.status(403).json({ success: false, message: "Your alumni account is pending admin approval." });
  }
  next();
};

module.exports = { authenticate, authorize, requireApprovedAlumni, formatUser };