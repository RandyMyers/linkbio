const config = require('../config');
const GatewayPayment = require('../models/GatewayPayment');
const { normalizeCurrency } = require('../lib/currencies');
const { buildOrderId, toMinorUnits } = require('../lib/gatewayPayments');
const { resolveGatewayConfig } = require('./gatewayConfig');
const { initiateCardPayment, verifyTransaction } = require('../lib/squadClient');
const { fulfillGatewayPayment, isSuccessfulStatus } = require('./gatewayPaymentFulfillment');
const { assertPaidPlan } = require('./flutterwaveBilling');

const SQUAD_CURRENCIES = new Set(['usd']);

async function getSquadCreds() {
  const cfg = await resolveGatewayConfig('squad');
  if (!cfg?.configured || !cfg.secretKey) {
    const err = new Error('Squad is not configured.');
    err.statusCode = 503;
    throw err;
  }
  return cfg;
}

function squadCurrencyForCheckout(currency) {
  const c = normalizeCurrency(currency);
  if (!SQUAD_CURRENCIES.has(c)) {
    const err = new Error('Squad card checkout supports USD only in this release.');
    err.statusCode = 400;
    throw err;
  }
  return c.toUpperCase();
}

async function createCardCheckout(user, { planSlug, interval, currency, successUrl, promoCode }) {
  const creds = await getSquadCreds();
  const checkout = await assertPaidPlan(user, { planSlug, interval, currency, promoCode });
  const { plan, billingInterval, priceCurrency, priceAmount, listAmount, creditAmount, chargeType, quote } =
    checkout;

  const squadCurrency = squadCurrencyForCheckout(priceCurrency);
  const orderId = buildOrderId('sq', user._id.toString(), planSlug);
  const transactionRef = orderId;
  const amountMinor = toMinorUnits(priceAmount, squadCurrency);

  const callbackUrl =
    successUrl ||
    `${config.clientOrigin}/checkout?plan=${planSlug}&interval=${billingInterval}&currency=${priceCurrency}&paid=1&provider=squad&orderId=${encodeURIComponent(orderId)}`;

  const initiated = await initiateCardPayment(creds.secretKey, {
    email: user.email,
    amountMinor,
    currency: squadCurrency,
    transactionRef,
    customerName: user.name || user.email,
    callbackUrl,
    metadata: {
      orderId,
      userId: user._id.toString(),
      planSlug,
      billingInterval,
    },
    environment: creds.environment,
  });

  const checkoutUrl = initiated.checkout_url || initiated.checkoutUrl || '';
  if (!checkoutUrl) {
    const err = new Error('Squad did not return a checkout URL.');
    err.statusCode = 502;
    throw err;
  }

  await GatewayPayment.create({
    userId: user._id,
    orderId,
    provider: 'squad',
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
    providerReference: initiated.transaction_ref || transactionRef,
    paymentStatus: 'pending',
    checkoutUrl,
    meta: { environment: creds.environment, initiate: initiated, chargeType, promoCode: quote?.promoCode },
  });

  return {
    orderId,
    transactionRef: initiated.transaction_ref || transactionRef,
    checkoutUrl,
    currency: squadCurrency,
    amountMinor,
  };
}

async function confirmCardPayment(user, { orderId, transactionRef }) {
  const creds = await getSquadCreds();
  const record = await GatewayPayment.findOne({
    orderId: String(orderId).trim(),
    userId: user._id,
    provider: 'squad',
  });
  if (!record) {
    const err = new Error('Payment not found.');
    err.statusCode = 404;
    throw err;
  }

  if (record.paymentStatus === 'successful') {
    return { orderId: record.orderId, paymentStatus: record.paymentStatus, activated: true };
  }

  const ref = String(transactionRef || record.providerReference || '').trim();
  if (!ref) {
    const err = new Error('transaction_ref is required.');
    err.statusCode = 400;
    throw err;
  }

  const verified = await verifyTransaction(creds.secretKey, ref, creds.environment);
  const status =
    verified.transaction_status ||
    verified.status ||
    verified.payment_status ||
    verified.Status;

  const amountMinor = Number(
    verified.transaction_amount ?? verified.amount ?? verified.Amount ?? 0,
  );
  const expectedMinor = toMinorUnits(record.priceAmount, record.priceCurrency);

  if (!isSuccessfulStatus('squad', status) || (amountMinor > 0 && amountMinor !== expectedMinor)) {
    record.paymentStatus = 'failed';
    record.meta = { ...record.meta, lastVerify: verified };
    await record.save();
    const err = new Error('Payment verification failed.');
    err.statusCode = 400;
    throw err;
  }

  const result = await fulfillGatewayPayment(record, {
    status: 'successful',
    providerReference: ref,
    metaPatch: { lastVerify: verified },
  });

  return {
    orderId: record.orderId,
    paymentStatus: record.paymentStatus,
    activated: result.activated,
  };
}

module.exports = {
  createCardCheckout,
  confirmCardPayment,
  SQUAD_CURRENCIES,
};
