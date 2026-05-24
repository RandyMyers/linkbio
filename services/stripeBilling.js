const config = require('../config');
const GatewayPayment = require('../models/GatewayPayment');
const { normalizeCurrency } = require('../lib/currencies');
const { buildOrderId, toMinorUnits } = require('../lib/gatewayPayments');
const { createCheckoutSession, retrieveCheckoutSession } = require('../lib/stripeClient');
const { resolveGatewayConfig } = require('./gatewayConfig');
const { fulfillGatewayPayment } = require('./gatewayPaymentFulfillment');
const { assertPaidPlan } = require('./flutterwaveBilling');

const STRIPE_CURRENCIES = new Set(['usd', 'eur', 'gbp']);

async function getStripeCreds() {
  const cfg = await resolveGatewayConfig('stripe');
  if (!cfg?.configured || !cfg.secretKey) {
    const err = new Error('Stripe is not configured.');
    err.statusCode = 503;
    throw err;
  }
  return cfg;
}

function stripeCurrencyForCheckout(currency) {
  const c = normalizeCurrency(currency);
  if (!STRIPE_CURRENCIES.has(c)) {
    const err = new Error('Stripe checkout supports USD, EUR, and GBP only.');
    err.statusCode = 400;
    throw err;
  }
  return c;
}

function buildStripeReturnUrls({ planSlug, billingInterval, priceCurrency, orderId }) {
  const base = `${config.clientOrigin}/checkout?plan=${encodeURIComponent(planSlug)}&interval=${encodeURIComponent(billingInterval)}&currency=${encodeURIComponent(priceCurrency)}`;
  const successUrl = `${base}&paid=1&provider=stripe&orderId=${encodeURIComponent(orderId)}&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${base}&checkout=canceled`;
  return { successUrl, cancelUrl };
}

async function createCardCheckout(user, { planSlug, interval, currency, successUrl, cancelUrl, promoCode }) {
  const creds = await getStripeCreds();
  const checkout = await assertPaidPlan(user, { planSlug, interval, currency, promoCode });
  const { plan, billingInterval, priceCurrency, priceAmount, listAmount, creditAmount, chargeType, quote } =
    checkout;

  const stripeCurrency = stripeCurrencyForCheckout(priceCurrency);
  const orderId = buildOrderId('st', user._id.toString(), planSlug);
  const amountMinor = toMinorUnits(priceAmount, stripeCurrency);
  const urls = buildStripeReturnUrls({ planSlug, billingInterval, priceCurrency, orderId });

  const session = await createCheckoutSession(creds.secretKey, {
    orderId,
    amountMinor,
    currency: stripeCurrency,
    customerEmail: user.email,
    planLabel: plan.label || planSlug,
    successUrl: successUrl || urls.successUrl,
    cancelUrl: cancelUrl || urls.cancelUrl,
    metadata: {
      userId: user._id.toString(),
      planSlug,
      billingInterval,
    },
  });

  const checkoutUrl = session.url || '';
  if (!checkoutUrl) {
    const err = new Error('Stripe did not return a checkout URL.');
    err.statusCode = 502;
    throw err;
  }

  await GatewayPayment.create({
    userId: user._id,
    orderId,
    provider: 'stripe',
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
    providerReference: session.id,
    paymentStatus: 'pending',
    checkoutUrl,
    meta: { environment: creds.environment, sessionId: session.id, chargeType, promoCode: quote?.promoCode },
  });

  return {
    orderId,
    sessionId: session.id,
    checkoutUrl,
    paymentLinkUrl: checkoutUrl,
    currency: stripeCurrency.toUpperCase(),
    amountMinor,
  };
}

function sessionMatchesRecord(session, record) {
  const metaOrderId = session.metadata?.orderId || session.client_reference_id || '';
  if (String(metaOrderId).trim() !== record.orderId) return false;

  if (session.payment_status !== 'paid') return false;

  const expectedMinor = toMinorUnits(record.priceAmount, record.priceCurrency);
  const amountTotal = Number(session.amount_total || 0);
  const sessionCurrency = String(session.currency || '').toLowerCase();
  const recordCurrency = String(record.priceCurrency || '').toLowerCase();

  if (sessionCurrency && recordCurrency && sessionCurrency !== recordCurrency) return false;
  if (amountTotal > 0 && amountTotal !== expectedMinor) return false;

  return true;
}

async function confirmCardPayment(user, { orderId, sessionId }) {
  const creds = await getStripeCreds();
  const record = await GatewayPayment.findOne({
    orderId: String(orderId).trim(),
    userId: user._id,
    provider: 'stripe',
  });
  if (!record) {
    const err = new Error('Payment not found.');
    err.statusCode = 404;
    throw err;
  }

  if (record.paymentStatus === 'successful') {
    return { orderId: record.orderId, paymentStatus: record.paymentStatus, activated: true };
  }

  const sid = String(sessionId || record.providerReference || record.meta?.sessionId || '').trim();
  if (!sid) {
    const err = new Error('session_id is required.');
    err.statusCode = 400;
    throw err;
  }

  const session = await retrieveCheckoutSession(creds.secretKey, sid);
  if (!sessionMatchesRecord(session, record)) {
    record.paymentStatus = 'failed';
    record.meta = { ...record.meta, lastSession: { id: session.id, payment_status: session.payment_status } };
    await record.save();
    const err = new Error('Payment verification failed.');
    err.statusCode = 400;
    throw err;
  }

  const result = await fulfillGatewayPayment(record, {
    status: 'successful',
    providerReference: session.id,
    metaPatch: { lastSession: { id: session.id, payment_status: session.payment_status } },
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
  sessionMatchesRecord,
  STRIPE_CURRENCIES,
};
