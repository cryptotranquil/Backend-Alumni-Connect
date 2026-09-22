const multer = require("multer");

const errorHandler = (error, _req, res, _next) => {
  console.error(error);
  let status = Number(error.status || error.statusCode) || 500;
  let message = error.message || "Internal server error";

  if (error instanceof multer.MulterError) {
    status = 400;
    message =
      error.code === "LIMIT_FILE_SIZE"
        ? "Uploaded file is too large"
        : error.message;
  }
  if (error.code === 5 || error.code === "NOT_FOUND") status = 404;
  if (error.code === 6 || error.code === "ALREADY_EXISTS") status = 409;
  if (status >= 500 && process.env.NODE_ENV === "production") {
    message = "Internal server error";
  }
  res.status(status).json({ success: false, message });
};

module.exports = { errorHandler };
