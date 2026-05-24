const cloudinary = require('cloudinary').v2;
const cloudinaryConfig = require('../config/cloudinary');

const isConfigured =
  cloudinaryConfig.cloud_name && cloudinaryConfig.api_key && cloudinaryConfig.api_secret;

if (isConfigured) {
  cloudinary.config(cloudinaryConfig);
}

async function uploadToCloudinary(file, options = {}) {
  if (!isConfigured) {
    throw new Error(
      'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.',
    );
  }

  const uploadOptions = {
    resource_type: 'image',
    folder: options.folder || 'linkbio',
    use_filename: true,
    unique_filename: true,
    overwrite: false,
    transformation: [{ quality: 'auto', fetch_format: 'auto' }],
    ...options,
  };

  if (file.tempFilePath) {
    const result = await cloudinary.uploader.upload(file.tempFilePath, uploadOptions);
    return formatResult(result);
  }

  if (file.data) {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(uploadOptions, (err, result) => {
        if (err) reject(err);
        else resolve(formatResult(result));
      });
      stream.end(file.data);
    });
  }

  throw new Error('Invalid file format.');
}

function formatResult(result) {
  return {
    url: result.secure_url,
    publicId: result.public_id,
    width: result.width,
    height: result.height,
    format: result.format,
    bytes: result.bytes,
  };
}

module.exports = { uploadToCloudinary, isCloudinaryConfigured: () => isConfigured };
