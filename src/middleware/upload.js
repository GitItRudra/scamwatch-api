const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../config/env');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { matchesSignature, removeFiles } = require('../utils/fileSignature');
const { MAX_EVIDENCE_FILES } = require('../constants');

const EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

fs.mkdirSync(config.upload.dir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: config.upload.dir,
    // Never trust the client's file name: it is stored separately as metadata only
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${EXTENSIONS[file.mimetype]}`),
  }),
  limits: { fileSize: config.upload.maxBytes, files: MAX_EVIDENCE_FILES },
  fileFilter: (req, file, cb) => {
    if (EXTENSIONS[file.mimetype]) return cb(null, true);
    return cb(AppError.unprocessable('Only JPEG, PNG, WebP images and PDF files are accepted'));
  },
});

const verifySignatures = asyncHandler(async (req, res, next) => {
  const files = req.files || [];
  const results = await Promise.all(files.map((f) => matchesSignature(f.path, f.mimetype)));
  if (results.includes(false)) {
    await removeFiles(files.map((f) => f.path));
    throw AppError.unprocessable('One or more files do not match their declared type');
  }
  next();
});

module.exports = { uploadEvidence: [upload.array('files', MAX_EVIDENCE_FILES), verifySignatures] };
