const mongoose = require('mongoose');

const gatewayCredentialSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    label: { type: String, default: '', trim: true },
    environment: {
      type: String,
      enum: ['sandbox', 'production'],
      default: 'production',
    },
    encryptedValue: { type: String, default: '' },
    iv: { type: String, default: '' },
    authTag: { type: String, default: '' },
    keyVersion: { type: Number, default: 1 },
    maskedApiKey: { type: String, default: '' },
    isActive: { type: Boolean, default: true, index: true },
    lastRotatedAt: { type: Date },
    createdBy: { type: String, default: 'system', trim: true },
    updatedBy: { type: String, default: 'system', trim: true },
  },
  { timestamps: true },
);

gatewayCredentialSchema.index({ provider: 1, isActive: 1 });
gatewayCredentialSchema.index({ provider: 1, environment: 1 }, { unique: true });

module.exports =
  mongoose.models.GatewayCredential || mongoose.model('GatewayCredential', gatewayCredentialSchema);
