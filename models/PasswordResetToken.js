const mongoose = require('mongoose');
const crypto = require('crypto');

const passwordResetTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

passwordResetTokenSchema.statics.hashToken = function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
};

passwordResetTokenSchema.statics.generateRawToken = function generateRawToken() {
  return crypto.randomBytes(32).toString('hex');
};

module.exports =
  mongoose.models.PasswordResetToken || mongoose.model('PasswordResetToken', passwordResetTokenSchema);
