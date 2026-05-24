const mongoose = require('mongoose');

const socialPlatformSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, lowercase: true, trim: true },
    label: { type: String, required: true },
    emoji: { type: String, default: '' },
    logoDomain: { type: String, default: null },
    placeholder: { type: String, default: '' },
    sortOrder: { type: Number, default: 0 },
    /** Last seed / Logo.dev verification */
    logoVerifiedAt: { type: Date, default: null },
    logoVerifyOk: { type: Boolean, default: null },
  },
  { timestamps: true },
);

module.exports = mongoose.models.SocialPlatform || mongoose.model('SocialPlatform', socialPlatformSchema);
