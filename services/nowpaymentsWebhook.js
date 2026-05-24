const CryptoPayment = require('../models/CryptoPayment');
const { verifyIpnSignature, isPaidStatus } = require('../lib/nowpaymentsIpn');
const { activateUserSubscription } = require('../lib/subscriptionActivation');
const { getNowPaymentsIpnSecret } = require('./gatewayConfig');

async function handleNowPaymentsIpn(body, signatureHeader) {
  const ipnSecret = await getNowPaymentsIpnSecret();
  if (!ipnSecret) {
    throw new Error('NOWPAYMENTS_IPN_SECRET not configured');
  }
  if (!verifyIpnSignature(body, signatureHeader, ipnSecret)) {
    const err = new Error('Invalid IPN signature');
    err.statusCode = 401;
    throw err;
  }

  const orderId = String(body.order_id || '');
  const paymentStatus = String(body.payment_status || '').toLowerCase();
  if (!orderId) return { ok: true, ignored: true };

  const record = await CryptoPayment.findOne({ orderId });
  if (!record) return { ok: true, ignored: true };

  record.paymentStatus = paymentStatus;
  if (body.payment_id) record.nowpaymentsPaymentId = String(body.payment_id);
  record.meta = { ...record.meta, lastIpn: body };
  await record.save();

  if (!isPaidStatus(paymentStatus)) {
    return { ok: true, status: paymentStatus };
  }

  if (record.type === 'subscription' && record.userId) {
    await activateUserSubscription(record.userId, {
      planSlug: record.planSlug,
      billingInterval: record.billingInterval,
      chargeType: record.chargeType,
      amountCharged: record.priceAmount,
      creditApplied: record.creditAmount ?? 0,
      paymentRef: { kind: 'crypto', id: record.orderId },
    });

    const { applyCheckoutBalances } = require('../lib/subscriptionCheckout');
    await applyCheckoutBalances(record.userId, {
      promoCode: record.promoCode,
      accountCreditApplied: record.accountCreditApplied,
      currency: record.priceCurrency,
    });
  }

  return { ok: true, status: paymentStatus, activated: record.type === 'subscription' };
}

module.exports = { handleNowPaymentsIpn };
