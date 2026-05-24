const GatewayPayment = require('../models/GatewayPayment');
const { activateUserSubscription } = require('../lib/subscriptionActivation');

function isSuccessfulStatus(provider, raw) {
  const s = String(raw || '').toLowerCase();
  if (provider === 'flutterwave') {
    return s === 'successful' || s === 'success';
  }
  if (provider === 'squad') {
    return s === 'success' || s === 'successful' || s === 'completed' || s === 'paid';
  }
  if (provider === 'stripe') {
    return s === 'paid' || s === 'successful' || s === 'success';
  }
  return false;
}

async function fulfillGatewayPayment(record, { status, providerReference, metaPatch } = {}) {
  if (!record) return { ok: false, ignored: true };

  const normalized = isSuccessfulStatus(record.provider, status)
    ? 'successful'
    : String(status || record.paymentStatus).toLowerCase() === 'failed'
      ? 'failed'
      : record.paymentStatus;

  if (record.paymentStatus === 'successful' && normalized === 'successful') {
    return { ok: true, alreadyFulfilled: true };
  }

  if (providerReference) record.providerReference = String(providerReference);
  record.paymentStatus = normalized;
  if (metaPatch && typeof metaPatch === 'object') {
    record.meta = { ...record.meta, ...metaPatch };
  }
  await record.save();

  if (normalized !== 'successful' || record.type !== 'subscription' || !record.userId) {
    return { ok: true, status: normalized, activated: false };
  }

  await activateUserSubscription(record.userId, {
    planSlug: record.planSlug,
    billingInterval: record.billingInterval,
    chargeType: record.chargeType || record.meta?.chargeType,
    amountCharged: record.priceAmount,
    creditApplied: record.creditAmount ?? 0,
    paymentRef: { kind: 'gateway', id: record.orderId },
  });

  const { applyCheckoutBalances } = require('../lib/subscriptionCheckout');
  await applyCheckoutBalances(record.userId, {
    promoCode: record.promoCode || record.meta?.promoCode,
    accountCreditApplied: record.accountCreditApplied ?? record.meta?.accountCreditApplied,
    currency: record.priceCurrency,
  });

  return { ok: true, status: normalized, activated: true };
}

async function findGatewayPaymentByOrderId(orderId, userId) {
  const q = { orderId: String(orderId).trim() };
  if (userId) q.userId = userId;
  return GatewayPayment.findOne(q);
}

module.exports = {
  fulfillGatewayPayment,
  findGatewayPaymentByOrderId,
  isSuccessfulStatus,
};
