const mongoose = require('mongoose');

const customDomainSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    profileId: { type: mongoose.Schema.Types.ObjectId, ref: 'BioProfile', required: true, index: true },
    hostname: { type: String, required: true, unique: true, lowercase: true, trim: true },
    status: {
      type: String,
      enum: ['pending', 'verified', 'active', 'failed'],
      default: 'pending',
    },
    verificationToken: { type: String, default: '' },
    verificationMethod: { type: String, default: 'cname' },
    sslStatus: { type: String, default: 'pending' },
    lastCheckedAt: { type: Date, default: null },
    failureReason: { type: String, default: '' },
  },
  { timestamps: true },
);

module.exports = mongoose.models.CustomDomain || mongoose.model('CustomDomain', customDomainSchema);
