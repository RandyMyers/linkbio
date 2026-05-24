const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    category: {
      type: String,
      enum: ['subscription', 'billing', 'product', 'account'],
      default: 'subscription',
      index: true,
    },
    type: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, default: '', trim: true },
    linkUrl: { type: String, default: '' },
    readAt: { type: Date, default: null, index: true },
    emailSentAt: { type: Date, default: null },
    dedupKey: { type: String, required: true, trim: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, dedupKey: 1 }, { unique: true });

module.exports =
  mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
