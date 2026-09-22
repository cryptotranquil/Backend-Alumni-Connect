const multer = require("multer");
const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const rootFolder = process.env.CLOUDINARY_FOLDER || "alumni-connect";

/** Small Multer storage engine backed by Cloudinary's maintained upload API. */
class CloudinaryStorage {
  constructor(optionsForFile) {
    this.optionsForFile = optionsForFile;
  }

  _handleFile(req, file, callback) {
    const options = this.optionsForFile(req, file);
    const upload = cloudinary.uploader.upload_stream(
      options,
      (error, result) => {
        if (error) return callback(error);
        return callback(null, {
          path: result.secure_url,
          filename: result.public_id,
          publicId: result.public_id,
          bytes: result.bytes,
          format: result.format,
        });
      },
    );
    file.stream.pipe(upload);
  }

  _removeFile(_req, file, callback) {
    if (!file.publicId) return callback(null);
    cloudinary.uploader.destroy(file.publicId).finally(() => callback(null));
  }
}

const cvStorage = new CloudinaryStorage((req) => ({
  folder: `${rootFolder}/cvs`,
  resource_type: "image",
  format: "pdf",
  public_id: `cv_${req.user.userId}_${Date.now()}`,
}));

const uploadCV = multer({
  storage: cvStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const allowed = file.mimetype === "application/pdf";
    callback(allowed ? null : new Error("Only PDF files are allowed"), allowed);
  },
});

const photoStorage = new CloudinaryStorage((req, file) => ({
  folder: `${rootFolder}/${file.fieldname === "cover" ? "covers" : "photos"}`,
  resource_type: "image",
  allowed_formats: ["jpg", "jpeg", "png", "webp"],
  transformation:
    file.fieldname === "cover"
      ? [{ width: 1600, height: 500, crop: "fill", gravity: "auto" }]
      : [{ width: 400, height: 400, crop: "fill", gravity: "face" }],
  public_id: `${file.fieldname}_${req.user.userId}_${Date.now()}`,
}));

const imageUploadOptions = {
  storage: photoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const allowed = file.mimetype.startsWith("image/");
    callback(allowed ? null : new Error("Only image files are allowed"), allowed);
  },
};

const uploadPhoto = multer(imageUploadOptions);
const uploadProfileMedia = multer(imageUploadOptions);

module.exports = { uploadCV, uploadPhoto, uploadProfileMedia };
