const config = require('../config');
const User = require('../models/User');
const GatewayPayment = require('../models/GatewayPayment');
const { resolveSubscriptionCheckout } = require('../lib/subscriptionCheckout');
const { buildOrderId, FLUTTERWAVE_CARD_OPTIONS } = require('../lib/gatewayPayments');
const { resolveGatewayConfig } = require('./gatewayConfig');
const { verifyTransactionById, verifyTransactionByTxRef } = require('../lib/flutterwaveClient');
const { fulfillGatewayPayment, isSuccessfulStatus } = require('./gatewayPaymentFulfillment');

async function getFlutterwaveCreds() {
  const cfg = await resolveGatewayConfig('flutterwave');
  if (!cfg?.configured || !cfg.secretKey) {
    const err = new Error('Flutterwave is not configured.');
    err.statusCode = 503;
    throw err;
  }
  if (!cfg.publicKey) {
    const err = new Error('Flutterwave public key is missing in gateway settings.');
    err.statusCode = 503;
    throw err;
  }
  return cfg;
}

async function assertPaidPlan(user, { planSlug, interval, currency, promoCode }) {
  return resolveSubscriptionCheckout(user, { planSlug, interval, currency, promoCode });
}

async function createCardCheckout(user, { planSlug, interval, currency, promoCode }) {
  const creds = await getFlutterwaveCreds();
  const checkout = await assertPaidPlan(user, { planSlug, interval, currency, promoCode });
  const { plan, billingInterval, priceCurrency, priceAmount, listAmount, creditAmount, chargeType, quote } =
    checkout;

  const orderId = buildOrderId('fw', user._id.toString(), planSlug);
  const txRef = orderId;

  await GatewayPayment.create({
    userId: user._id,
    orderId,
    provider: 'flutterwave',
    type: 'subscription',
    planSlug,
    billingInterval,
    priceAmount,
    priceCurrency,
    listAmount: listAmount ?? priceAmount,
    creditAmount: creditAmount ?? 0,
    chargeType: chargeType || 'new',
    promoCode: quote?.promoCode || '',
    promoDiscount: quote?.promoDiscount || 0,
    accountCreditApplied: quote?.accountCreditApplied || 0,
    providerReference: txRef,
    paymentStatus: 'pending',
    meta: { environment: creds.environment, chargeType, promoCode: quote?.promoCode },
  });

  return {
    orderId,
    txRef,
    amount: priceAmount,
    currency: priceCurrency.toUpperCase(),
    publicKey: creds.publicKey,
    paymentOptions: FLUTTERWAVE_CARD_OPTIONS,
    customer: {
      email: user.email,
      name: user.name || user.email,
      phone_number: user.phone || '',
    },
    customizations: {
      title: 'LinkBio',
      description: `${plan.label} subscription (${billingInterval})`,
      logo: `${config.clientOrigin}/favicon.ico`,
    },
  };
}

function amountsMatch(expectedMajor, verifiedAmount, currency) {
  const exp = Number(expectedMajor);
  const got = Number(verifiedAmount);
  if (!Number.isFinite(exp) || !Number.isFinite(got)) return false;
  const c = String(currency || '').toUpperCase();
  if (c === 'NGN' || c === 'JPY') {
    return Math.abs(got - exp) < 1;
  }
  return Math.abs(got - exp) < 0.02;
}

async function confirmCardPayment(user, { orderId, transactionId }) {
  const creds = await getFlutterwaveCreds();
  const record = await GatewayPayment.findOne({
    orderId: String(orderId).trim(),
    userId: user._id,
    provider: 'flutterwave',
  });
  if (!record) {
    const err = new Error('Payment not found.');
    err.statusCode = 404;
    throw err;
  }

  if (record.paymentStatus === 'successful') {
    return { orderId: record.orderId, paymentStatus: record.paymentStatus, activated: true };
  }

  const verified = transactionId
    ? await verifyTransactionById(creds.secretKey, transactionId)
    : await verifyTransactionByTxRef(creds.secretKey, record.providerReference);

  const status = verified.status;
  const txRef = verified.tx_ref || verified.txRef;
  const cur = verified.currency || record.priceCurrency;
  const okAmount = amountsMatch(record.priceAmount, verified.amount, cur);
  const okRef = !txRef || txRef === record.orderId || txRef === record.providerReference;

  if (!isSuccessfulStatus('flutterwave', status) || !okAmount || !okRef) {
    record.paymentStatus = 'failed';
    record.meta = { ...record.meta, lastVerify: verified };
    await record.save();
    const err = new Error('Payment verification failed.');
    err.statusCode = 400;
    throw err;
  }

  const result = await fulfillGatewayPayment(record, {
    status: 'successful',
    providerReference: String(verified.id || transactionId || txRef),
    metaPatch: { lastVerify: verified },
  });

  return {
    orderId: record.orderId,
    paymentStatus: record.paymentStatus,
    activated: result.activated,
  };
}

module.exports = {
  assertPaidPlan,
  createCardCheckout,
  confirmCardPayment,
};
