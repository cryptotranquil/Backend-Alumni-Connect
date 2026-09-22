const express = require("express");
const { body } = require("express-validator");
const authController = require("../controllers/authController");
const { authenticate } = require("../middleware/authMiddleware");
const {
  registerValidation,
  loginValidation,
  resetPasswordValidation,
  twoFactorVerifyValidation,
  twoFactorResendValidation,
  validate,
} = require("../middleware/validation");

const router = express.Router();
router.get("/bootstrap", authController.bootstrap);
router.post("/register", registerValidation, validate, authController.register);
router.post("/login", loginValidation, validate, authController.login);
// Second step of sign-in: emailed one-time code (2FA).
router.post(
  "/login/verify-2fa",
  twoFactorVerifyValidation,
  validate,
  authController.verifyTwoFactor,
);
router.post(
  "/login/resend-2fa",
  twoFactorResendValidation,
  validate,
  authController.resendTwoFactor,
);
router.post(
  "/forgot-password",
  [body("email").isEmail().withMessage("Valid email is required")],
  validate,
  authController.forgotPassword,
);
router.post(
  "/reset-password",
  resetPasswordValidation,
  validate,
  authController.resetPasswordWithToken,
);
router.post("/logout", authenticate, authController.logout);
module.exports = router;
