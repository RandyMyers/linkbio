const mongoose = require('mongoose');

const cryptoPaymentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    orderId: { type: String, required: true, unique: true, index: true },
    type: { type: String, enum: ['subscription', 'product'], default: 'subscription' },
    planSlug: { type: String, default: '' },
    billingInterval: { type: String, default: 'monthly' },
    productId: { type: String, default: '' },
    username: { type: String, default: '' },
    priceAmount: { type: Number, required: true },
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
    priceCurrency: { type: String, default: 'usd' },
    nowpaymentsInvoiceId: { type: String, default: '', index: true },
    nowpaymentsPaymentId: { type: String, default: '', index: true },
    paymentStatus: { type: String, default: 'waiting' },
    invoiceUrl: { type: String, default: '' },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

module.exports = mongoose.models.CryptoPayment || mongoose.model('CryptoPayment', cryptoPaymentSchema);
