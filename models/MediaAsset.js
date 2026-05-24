const mongoose = require('mongoose');

const mediaAssetSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    profileId: { type: mongoose.Schema.Types.ObjectId, ref: 'BioProfile', index: true },
    kind: { type: String, enum: ['avatar', 'block', 'product', 'og'], default: 'block' },
    url: { type: String, required: true },
    publicId: { type: String, default: '' },
    bytes: { type: Number, default: 0 },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    format: { type: String, default: '' },
  },
  { timestamps: true },
);

module.exports = mongoose.models.MediaAsset || mongoose.model('MediaAsset', mediaAssetSchema);
