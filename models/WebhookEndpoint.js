const mongoose = require('mongoose');

const webhookEndpointSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    url: { type: String, required: true, trim: true },
    events: { type: [String], default: () => ['profile.published', 'subscriber.created'] },
    secret: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    lastDeliveryAt: { type: Date, default: null },
    lastStatus: { type: Number, default: null },
  },
  { timestamps: true },
);

module.exports = mongoose.models.WebhookEndpoint || mongoose.model('WebhookEndpoint', webhookEndpointSchema);
