const { body, query } = require("express-validator");
const { isValidRegistrationNumber, FORMAT_EXAMPLE } = require("../utils/registrationNumber");

const optionalText = (field, label) =>
  body(field)
    .optional({ values: "falsy" })
    .isString().withMessage(`${label} must be text`).bail()
    .trim()
    .stripLow()
    .isLength({ max: 200 }).withMessage(`${label} must be at most 200 characters`);

const shared = [
  optionalText("department", "Department"),
  optionalText("program", "Program"),
  body("graduationYear")
    .optional({ values: "falsy" })
    .customSanitizer((value) => String(value).replace(/^(\d{4})\.0+$/, "$1"))
    .matches(/^\d{4}$/).withMessage("Graduation year must be a four-digit year"),
  body("email")
    .optional({ values: "falsy" })
    .isEmail().withMessage("Email is not valid"),
];

const fullName = (required) => {
  const chain = required ? body("fullName").exists({ values: "falsy" }).withMessage("Full name is required").bail() : body("fullName").optional();
  return chain
    .isString().withMessage("Full name must be text").bail()
    .trim()
    .stripLow()
    .isLength({ min: 2, max: 200 }).withMessage("Full name must be 2 to 200 characters");
};

const createEntryValidation = [
  body("registrationNumber")
    .exists({ values: "falsy" }).withMessage("Registration number is required").bail()
    .custom((value) => isValidRegistrationNumber(value))
    .withMessage(`Invalid registration number (expected a format like ${FORMAT_EXAMPLE})`),
  fullName(true),
  ...shared,
];

const updateEntryValidation = [
  fullName(false),
  ...shared,
  body().custom((value) => {
    const fields = ["fullName", "department", "program", "graduationYear", "email"];
    if (!fields.some((field) => value && value[field] !== undefined)) {
      throw new Error("Send at least one field to update");
    }
    return true;
  }),
];

const listValidation = [
  query("status").optional().isIn(["claimed", "unclaimed"]).withMessage("status must be claimed or unclaimed"),
  query("limit").optional().isInt({ min: 1, max: 200 }).withMessage("limit must be between 1 and 200"),
];

module.exports = { createEntryValidation, updateEntryValidation, listValidation };
