const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true, minlength: 6, select: false },
    role: {
      type: String,
      enum: ["student", "alumni", "admin"],
      required: true,
    },
    phone: { type: String, default: "" },
    graduationYear: { type: String, default: "" },
    university: { type: String, default: "" },
    company: { type: String, default: "" },
    position: { type: String, default: "" },
    profilePhoto: { type: String, default: "" },
    skills: [{ type: String }],
    bio: { type: String, default: "" },
    cvUrl: { type: String, default: "" },
    isApproved: { type: Boolean, default: true },
    mustChangePassword: { type: Boolean, default: false },
    passwordResetTokenHash: { type: String, default: null, select: false },
    passwordResetExpires: { type: Date, default: null },

    // NEW FIELDS FOR SPECIFICATION
    registrationNumber: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      uppercase: true,
      validate: {
        validator: function (v) {
          if (this.role === "student") {
            return v && v.length >= 5;
          }
          return true;
        },
        message:
          "Registration number is required for students and must be at least 5 characters",
      },
    },
    department: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          if ((this.role === "student" || this.role === "alumni") && !v) {
            return false;
          }
          return true;
        },
        message: "Department is required for students and alumni",
      },
    },
    interests: [{ type: String }], // For mentorship matching
  },
  { timestamps: true },
);

// Add indexes for faster queries
userSchema.index({ department: 1, role: 1 });

userSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.matchPassword = function matchPassword(entered) {
  return bcrypt.compare(entered, this.password);
};

module.exports = mongoose.model("User", userSchema);
