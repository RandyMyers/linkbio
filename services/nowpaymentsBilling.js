const crypto = require('crypto');
const config = require('../config');
const Plan = require('../models/Plan');
const CryptoPayment = require('../models/CryptoPayment');
const { createInvoice } = require('../lib/nowpaymentsClient');
const { resolveGatewayConfig } = require('./gatewayConfig');
const { resolveSubscriptionCheckout } = require('../lib/subscriptionCheckout');

function buildOrderId(userId, planSlug) {
  return `lb_${userId}_${planSlug}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

async function ipnUrl() {
  const cfg = await resolveGatewayConfig('nowpayments');
  if (cfg?.ipnCallbackUrl) return cfg.ipnCallbackUrl;
  if (config.nowpaymentsIpnCallbackUrl) return config.nowpaymentsIpnCallbackUrl;
  const base = (config.apiPublicUrl || `http://localhost:${config.port}`).replace(/\/$/, '');
  return `${base}/api/webhooks/nowpayments`;
}

async function createSubscriptionInvoice(user, { planSlug, interval, currency, successUrl, cancelUrl, promoCode }) {
  const checkout = await resolveSubscriptionCheckout(user, { planSlug, interval, currency, promoCode });
  const {
    plan,
    billingInterval,
    priceCurrency,
    priceAmount,
    listAmount,
    creditAmount,
    chargeType,
    quote,
  } = checkout;

  const orderId = buildOrderId(user._id.toString(), planSlug);
  const invoice = await createInvoice({
    priceAmount,
    priceCurrency,
    orderId,
    orderDescription: `LinkBio ${plan.label} (${billingInterval}, ${priceCurrency.toUpperCase()})`,
    successUrl: successUrl || `${config.clientOrigin}/dashboard/billing?paid=1`,
    cancelUrl: cancelUrl || `${config.clientOrigin}/pricing?checkout=canceled`,
    ipnCallbackUrl: await ipnUrl(),
  });

  await CryptoPayment.create({
    userId: user._id,
    orderId,
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
    nowpaymentsInvoiceId: String(invoice.id || invoice.invoice_id || ''),
    nowpaymentsPaymentId: String(invoice.payment_id || ''),
    paymentStatus: invoice.payment_status || 'waiting',
    invoiceUrl: invoice.invoice_url || invoice.url || '',
    meta: invoice,
  });

  return {
    orderId,
    invoiceUrl: invoice.invoice_url || invoice.url,
    invoiceId: invoice.id || invoice.invoice_id,
    priceAmount,
    priceCurrency,
  };
}

async function createProductInvoice({ priceAmount, orderId, description, successUrl, cancelUrl, meta = {} }) {
  const invoice = await createInvoice({
    priceAmount,
    orderId,
    orderDescription: description,
    successUrl,
    cancelUrl,
    ipnCallbackUrl: await ipnUrl(),
  });

  await CryptoPayment.create({
    userId: meta.userId || null,
    orderId,
    type: 'product',
    productId: meta.productId || '',
    username: meta.username || '',
    priceAmount,
    priceCurrency: 'usd',
    nowpaymentsInvoiceId: String(invoice.id || invoice.invoice_id || ''),
    nowpaymentsPaymentId: String(invoice.payment_id || ''),
    paymentStatus: invoice.payment_status || 'waiting',
    invoiceUrl: invoice.invoice_url || invoice.url || '',
    meta: invoice,
  });

  return {
    orderId,
    invoiceUrl: invoice.invoice_url || invoice.url,
    priceAmount,
  };
}

module.exports = { createSubscriptionInvoice, createProductInvoice, buildOrderId };
