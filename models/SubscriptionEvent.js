const mongoose = require('mongoose');

const subscriptionEventSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      required: true,
      enum: [
        'activated',
        'renewed',
        'upgraded',
        'downgrade_scheduled',
        'downgrade_applied',
        'canceled',
        'expired',
        'resumed',
        'admin_adjusted',
      ],
    },
    fromPlan: { type: String, default: '' },
    toPlan: { type: String, default: '' },
    billingInterval: { type: String, default: '' },
    currency: { type: String, default: '' },
    amountCharged: { type: Number, default: 0 },
    creditApplied: { type: Number, default: 0 },
    paidThroughBefore: { type: Date, default: null },
    paidThroughAfter: { type: Date, default: null },
    paymentRef: {
      kind: { type: String, default: '' },
      id: { type: String, default: '' },
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

subscriptionEventSchema.index({ userId: 1, createdAt: -1 });
subscriptionEventSchema.index({ type: 1, createdAt: -1 });

module.exports =
  mongoose.models.SubscriptionEvent ||
  mongoose.model('SubscriptionEvent', subscriptionEventSchema);
