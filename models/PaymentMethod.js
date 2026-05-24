const mongoose = require('mongoose');

const paymentMethodSchema = new mongoose.Schema(
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
    description: { type: String, default: '', trim: true },
    enabled: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    config: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    currencies: { type: [String], default: () => [] },
    plans: { type: [String], default: () => [] },
    isSystem: { type: Boolean, default: false },
  },
  { timestamps: true },
);

module.exports =
  mongoose.models.PaymentMethod || mongoose.model('PaymentMethod', paymentMethodSchema);
