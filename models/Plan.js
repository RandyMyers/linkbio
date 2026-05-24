const mongoose = require('mongoose');

const planSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    label: { type: String, required: true, trim: true },
    tagline: { type: String, default: '', trim: true },
    highlightBadge: { type: String, default: '', trim: true },
    description: { type: String, default: '', trim: true },
    featureBullets: { type: [String], default: [] },
    priceDisplayMonthly: { type: String, default: '', trim: true },
    priceDisplayYearly: { type: String, default: '', trim: true },
    maxProfiles: { type: Number, default: 1, min: 1 },
    maxBlocks: { type: Number, default: 50, min: 0 },
    customDomains: { type: Number, default: 0, min: 0 },
    advancedAnalytics: { type: Boolean, default: false },
    premiumThemes: { type: Boolean, default: false },
    hideWatermarkAllowed: { type: Boolean, default: false },
    commercePlatformFeePercent: { type: Number, default: 5, min: 0 },
    teamWorkspaces: { type: Boolean, default: false },
    apiAccess: { type: Boolean, default: false },
    requiresPaymentSubscription: { type: Boolean, default: false },
    allowedBillingIntervals: { type: [String], default: () => ['monthly', 'yearly'] },
    prices: {
      monthly: {
        usd: { type: Number, default: null },
        eur: { type: Number, default: null },
        gbp: { type: Number, default: null },
      },
      quarterly: {
        usd: { type: Number, default: null },
        eur: { type: Number, default: null },
        gbp: { type: Number, default: null },
      },
      yearly: {
        usd: { type: Number, default: null },
        eur: { type: Number, default: null },
        gbp: { type: Number, default: null },
      },
    },
    isActive: { type: Boolean, default: true },
    showOnLanding: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

planSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.models.Plan || mongoose.model('Plan', planSchema);
