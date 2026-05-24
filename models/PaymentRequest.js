const mongoose = require('mongoose');

const paymentRequestSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    requestedPlan: { type: String, required: true, lowercase: true, trim: true },
    billingInterval: {
      type: String,
      enum: ['monthly', 'quarterly', 'yearly'],
      default: 'monthly',
      index: true,
    },
    currency: { type: String, enum: ['usd', 'eur', 'gbp'], default: 'usd', lowercase: true },
    method: { type: String, enum: ['bank_transfer'], required: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    payerReference: { type: String, default: '', trim: true },
    listAmount: { type: Number, default: null },
    creditAmount: { type: Number, default: 0 },
    amountDue: { type: Number, default: null },
    chargeType: {
      type: String,
      enum: ['new', 'renewal', 'upgrade'],
      default: 'new',
    },
    promoCode: { type: String, default: '' },
    promoDiscount: { type: Number, default: 0 },
    accountCreditApplied: { type: Number, default: 0 },
    adminNote: { type: String, default: '', trim: true },
    decidedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

paymentRequestSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.models.PaymentRequest || mongoose.model('PaymentRequest', paymentRequestSchema);
