const mongoose = require('mongoose');

const gatewayPaymentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    orderId: { type: String, required: true, unique: true, index: true },
    provider: {
      type: String,
      required: true,
      enum: ['flutterwave', 'squad', 'stripe'],
      index: true,
    },
    type: { type: String, enum: ['subscription', 'product'], default: 'subscription' },
    planSlug: { type: String, default: '' },
    billingInterval: { type: String, default: 'monthly' },
    priceAmount: { type: Number, required: true },
    priceCurrency: { type: String, default: 'usd' },
    listAmount: { type: Number, default: null },
    creditAmount: { type: Number, default: 0 },
    chargeType: {
      type: String,
      enum: ['new', 'renewal', 'upgrade'],
      default: 'new',
    },
    promoCode: { type: String, default: '' },
    promoDiscount: { type: Number, default: 0 },
    accountCreditApplied: { type: Number, default: 0 },
    providerReference: { type: String, default: '', index: true },
    paymentStatus: {
      type: String,
      default: 'pending',
      enum: ['pending', 'successful', 'failed', 'expired'],
      index: true,
    },
    checkoutUrl: { type: String, default: '' },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

module.exports =
  mongoose.models.GatewayPayment || mongoose.model('GatewayPayment', gatewayPaymentSchema);
