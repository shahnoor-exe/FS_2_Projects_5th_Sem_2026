const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { Readable } = require('stream');

// ─── Configure Cloudinary SDK ─────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ─── Custom Cloudinary Storage Engine ────────────────────────────────────────
// Works with cloudinary v2 without needing multer-storage-cloudinary.
// Streams the file buffer directly to Cloudinary — nothing written to disk.
class CloudinaryStorage {
  _handleFile(req, file, callback) {
    const isVideo = file.mimetype.startsWith('video/');
    const resourceType = isVideo ? 'video' : 'image';

    const publicId = `social-composer/${Date.now()}-${file.originalname.replace(/\.[^/.]+$/, '').replace(/\s+/g, '_')}`;

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        resource_type: resourceType,
        folder: 'social-composer',
        overwrite: false,
      },
      (error, result) => {
        if (error) return callback(error);
        callback(null, {
          cloudinaryUrl: result.secure_url,
          cloudinaryPublicId: result.public_id,
          cloudinaryResourceType: resourceType,
          size: result.bytes,
        });
      }
    );

    // Pipe the incoming file stream into the Cloudinary upload stream
    Readable.from(file.stream).pipe(uploadStream);
  }

  _removeFile(req, file, callback) {
    // Called by multer if something fails after this storage step
    cloudinary.uploader
      .destroy(file.cloudinaryPublicId, {
        resource_type: file.cloudinaryResourceType || 'image',
      })
      .then(() => callback(null))
      .catch((err) => callback(err));
  }
}

// ─── File Filter ──────────────────────────────────────────────────────────────
const fileFilter = (req, file, cb) => {
  if (/^(image|video)\//.test(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image and video files are allowed.'), false);
  }
};

// ─── Multer instance (max 100MB) ───────────────────────────────────────────────
const upload = multer({
  storage: new CloudinaryStorage(),
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
});

module.exports = { upload, cloudinary };
