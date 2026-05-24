const mongoose = require('mongoose');

const subscriptionSnapshotSchema = new mongoose.Schema(
  {
    date: { type: String, required: true, unique: true, index: true },
    activeCount: { type: Number, default: 0 },
    freeCount: { type: Number, default: 0 },
    lapsedCount: { type: Number, default: 0 },
    mrrUsd: { type: Number, default: 0 },
    newPaid: { type: Number, default: 0 },
    churned: { type: Number, default: 0 },
    upgrades: { type: Number, default: 0 },
  },
  { timestamps: true },
);

module.exports =
  mongoose.models.SubscriptionSnapshot ||
  mongoose.model('SubscriptionSnapshot', subscriptionSnapshotSchema);
