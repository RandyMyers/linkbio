const mongoose = require('mongoose');

const subscriberSchema = new mongoose.Schema(
  {
    profileId: { type: mongoose.Schema.Types.ObjectId, ref: 'BioProfile', required: true, index: true },
    username: { type: String, lowercase: true, trim: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, default: '' },
    blockId: { type: String, default: '' },
    consentAt: { type: Date, default: Date.now },
    unsubscribedAt: { type: Date, default: null },
    source: { type: String, default: 'newsletter_block' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

subscriberSchema.index({ profileId: 1, email: 1 }, { unique: true });

module.exports = mongoose.models.Subscriber || mongoose.model('Subscriber', subscriberSchema);
