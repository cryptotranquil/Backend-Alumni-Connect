const multer = require("multer");
const { MAX_FILE_BYTES } = require("../utils/rosterFile");

// The roster file is parsed straight from memory and never stored (5 MB cap).
// File type is checked by the parser, which gives a specific error message.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
});

module.exports = { rosterUpload: upload.single("file") };
