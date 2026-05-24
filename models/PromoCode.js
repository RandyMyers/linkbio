const mongoose = require('mongoose');

const promoCodeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    label: { type: String, default: '', trim: true },
    discountType: { type: String, enum: ['percent', 'amount'], default: 'percent' },
    discountValue: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'usd', lowercase: true },
    planSlugs: { type: [String], default: () => [] },
    billingIntervals: { type: [String], default: () => [] },
    maxRedemptions: { type: Number, default: null },
    redemptionCount: { type: Number, default: 0 },
    validFrom: { type: Date, default: null },
    validUntil: { type: Date, default: null },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

module.exports = mongoose.models.PromoCode || mongoose.model('PromoCode', promoCodeSchema);
