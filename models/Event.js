const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema(
  {
    profileId: { type: mongoose.Schema.Types.ObjectId, ref: 'BioProfile', index: true },
    username: { type: String, lowercase: true, trim: true, index: true },
    type: { type: String, enum: ['view', 'click'], required: true },
    url: { type: String, default: '' },
    label: { type: String, default: '' },
    blockId: { type: String, default: '' },
    sessionId: { type: String, default: '' },
    visitorId: { type: String, default: '' },
    referrer: { type: String, default: '' },
    country: { type: String, default: '' },
    device: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

eventSchema.index({ profileId: 1, createdAt: -1 });
eventSchema.index({ username: 1, type: 1, createdAt: -1 });

module.exports = mongoose.models.Event || mongoose.model('Event', eventSchema);
