const BioProfile = require('../models/BioProfile');
const MediaAsset = require('../models/MediaAsset');
const { uploadToCloudinary, isCloudinaryConfigured } = require('../services/cloudinaryUpload');
const { asyncHandler } = require('../middleware/errorHandler');

const ALLOWED = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const MAX = 10 * 1024 * 1024;

function getFile(req, field) {
  if (!req.files || !req.files[field]) return null;
  return req.files[field];
}

function validateImage(file) {
  if (!ALLOWED.includes(file.mimetype)) {
    return 'Invalid file type. Use JPEG, PNG, GIF, or WebP.';
  }
  if (file.size > MAX) return 'File exceeds 10MB limit.';
  return null;
}

async function persistUpload(req, { kind, folder }) {
  if (!isCloudinaryConfigured()) {
    const err = new Error('Uploads not configured. Set Cloudinary env vars.');
    err.statusCode = 503;
    throw err;
  }

  const file = getFile(req, 'image') || getFile(req, 'file');
  if (!file) {
    const err = new Error('No image file provided (field: image or file).');
    err.statusCode = 400;
    throw err;
  }

  const validationError = validateImage(file);
  if (validationError) {
    const err = new Error(validationError);
    err.statusCode = 400;
    throw err;
  }

  const profile = await BioProfile.findOne({ userId: req.userId });
  const result = await uploadToCloudinary(file, {
    folder: `${folder}/${req.userId}`,
  });

  if (profile) {
    await MediaAsset.create({
      userId: req.userId,
      profileId: profile._id,
      kind,
      url: result.url,
      publicId: result.publicId,
      bytes: result.bytes,
      width: result.width,
      height: result.height,
      format: result.format,
    });
  }

  return result;
}

exports.uploadAvatar = asyncHandler(async (req, res) => {
  try {
    const result = await persistUpload(req, { kind: 'avatar', folder: 'linkbio/avatars' });
    res.json({ url: result.url, publicId: result.publicId, width: result.width, height: result.height });
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

exports.uploadImage = asyncHandler(async (req, res) => {
  try {
    const result = await persistUpload(req, { kind: 'block', folder: 'linkbio/blocks' });
    res.json({ url: result.url, publicId: result.publicId, width: result.width, height: result.height });
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});
