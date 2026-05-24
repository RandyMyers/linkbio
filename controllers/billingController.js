const mongoose = require('mongoose');
const User = require('../models/User');
const Plan = require('../models/Plan');
const PaymentRequest = require('../models/PaymentRequest');
const CryptoPayment = require('../models/CryptoPayment');
const { entitlementLimits } = require('../lib/entitlements');
const { VALID_BILLING_INTERVALS, normalizeInterval, normalizeAllowedBillingIntervals } = require('../lib/billingIntervals');
const { VALID_CURRENCIES, normalizeCurrency } = require('../lib/currencies');
const { quoteForPlan } = require('../lib/planPricing');
const { billingDisabledResponse } = require('../lib/nowpaymentsClient');
const { isNowPaymentsConfigured } = require('../services/gatewayConfig');
const { buildCreatorBillingPaymentConfig } = require('../services/paymentMethodsLoader');
const PlatformSettings = require('../models/PlatformSettings');
const { createSubscriptionInvoice } = require('../services/nowpaymentsBilling');
const {
  createCardCheckout: createFlutterwaveCheckout,
  confirmCardPayment: confirmFlutterwavePayment,
} = require('../services/flutterwaveBilling');
const {
  createCardCheckout: createSquadCheckout,
  confirmCardPayment: confirmSquadPayment,
} = require('../services/squadBilling');
const {
  createCardCheckout: createStripeCheckout,
  confirmCardPayment: confirmStripePayment,
} = require('../services/stripeBilling');
const { findGatewayPaymentByOrderId } = require('../services/gatewayPaymentFulfillment');
const { resolveClientOrigin } = require('../lib/allowedClientOrigins');
const {
  getSubscriptionState,
  scheduleDowngrade,
  cancelScheduledDowngrade,
} = require('../lib/subscriptionLifecycle');
const { quoteSubscriptionChange } = require('../lib/subscriptionProration');
const { resolveSubscriptionCheckout } = require('../lib/subscriptionCheckout');
const { subscriptionHistoryForUser } = require('../services/subscriptionHistory');
const { asyncHandler } = require('../middleware/errorHandler');

function serializePlanRow(p) {
  return {
    slug: p.slug,
    label: p.label,
    description: p.description || '',
    priceDisplayMonthly: p.priceDisplayMonthly || '',
    priceDisplayYearly: p.priceDisplayYearly || '',
    requiresPaymentSubscription: !!p.requiresPaymentSubscription,
    allowedBillingIntervals: normalizeAllowedBillingIntervals(p.allowedBillingIntervals, {
      requiresPayment: !!p.requiresPaymentSubscription,
    }),
    limits: {
      maxProfiles: p.maxProfiles ?? 1,
      maxBlocks: p.maxBlocks,
      customDomains: p.customDomains,
      advancedAnalytics: p.advancedAnalytics,
      premiumThemes: p.premiumThemes,
      hideWatermarkAllowed: p.hideWatermarkAllowed,
      commercePlatformFeePercent: p.commercePlatformFeePercent,
      teamWorkspaces: p.teamWorkspaces,
      apiAccess: p.apiAccess,
    },
  };
}

exports.getSubscription = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const state = getSubscriptionState(user);
  const { limits, storedPlan } = await entitlementLimits(user);
  res.json({
    ...state,
    storedPlan,
    limits,
  });
});

exports.getBilling = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { effectivePlan, limits, storedPlan } = await entitlementLimits(user);
  const catalog = await Plan.find({ isActive: true }).sort({ sortOrder: 1 }).lean();

  const pending = await PaymentRequest.find({ userId: user._id, status: 'pending' })
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  const recentCrypto = await CryptoPayment.find({ userId: user._id })
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  const platform = await PlatformSettings.findById('global').lean();
  const paymentConfig = await buildCreatorBillingPaymentConfig();
  const cryptoConfigured = await isNowPaymentsConfigured();

  res.json({
    subscriptionPlan: storedPlan,
    effectivePlan,
    subscriptionStatus: user.subscriptionStatus || 'none',
    subscriptionPaidThrough: user.subscriptionPaidThrough
      ? new Date(user.subscriptionPaidThrough).toISOString()
      : null,
    subscriptionBillingInterval: user.subscriptionBillingInterval || null,
    cancelAtPeriodEnd: !!user.cancelAtPeriodEnd,
    subscriptionPeriodStart: user.subscriptionPeriodStart
      ? new Date(user.subscriptionPeriodStart).toISOString()
      : null,
    scheduledPlanSlug: user.scheduledPlanSlug || null,
    scheduledChangeAt: user.scheduledChangeAt
      ? new Date(user.scheduledChangeAt).toISOString()
      : null,
    billingEnabled: platform?.billingEnabled !== false,
    nowpaymentsConfigured: cryptoConfigured,
    flutterwaveConfigured: paymentConfig.flutterwaveConfigured,
    squadConfigured: paymentConfig.squadConfigured,
    stripeConfigured: paymentConfig.stripeConfigured,
    billingIntervals:
      platform?.supportedIntervals?.length > 0
        ? platform.supportedIntervals.filter((iv) => VALID_BILLING_INTERVALS.includes(iv))
        : VALID_BILLING_INTERVALS,
    fiatCurrencies:
      platform?.supportedCurrencies?.length > 0
        ? platform.supportedCurrencies.filter((c) => VALID_CURRENCIES.includes(c))
        : VALID_CURRENCIES,
    defaultCurrency: platform?.defaultCurrency || 'usd',
    accountCredit: user.accountCredit || { usd: 0, eur: 0, gbp: 0 },
    paymentMethods: paymentConfig.paymentMethods,
    limits,
    planCatalog: catalog.map(serializePlanRow),
    paymentInstructions: paymentConfig.paymentInstructions,
    pendingPaymentRequests: pending.map((p) => ({
      id: p._id.toString(),
      requestedPlan: p.requestedPlan,
      billingInterval: normalizeInterval(p.billingInterval),
      currency: normalizeCurrency(p.currency),
      method: p.method,
      status: p.status,
      payerReference: p.payerReference || '',
      createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : null,
    })),
    recentCryptoPayments: recentCrypto.map((c) => ({
      orderId: c.orderId,
      planSlug: c.planSlug,
      paymentStatus: c.paymentStatus,
      invoiceUrl: c.invoiceUrl,
      createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : null,
    })),
  });
});

exports.createPaymentRequest = asyncHandler(async (req, res) => {
  const requestedPlan = String(req.body.requestedPlan || req.body.planSlug || '')
    .toLowerCase()
    .trim();
  const method = String(req.body.method || 'bank_transfer').toLowerCase();
  const payerReference = String(req.body.payerReference || '').trim().slice(0, 2000);
  const billingInterval = normalizeInterval(req.body.interval || req.body.billingInterval);
  const currency = normalizeCurrency(req.body.currency);

  const tier = await Plan.findOne({
    slug: requestedPlan,
    isActive: true,
    requiresPaymentSubscription: true,
  }).lean();
  if (!tier) {
    res.status(400).json({ error: 'Invalid or unavailable plan for upgrade requests' });
    return;
  }
  if (method !== 'bank_transfer') {
    res.status(400).json({ error: 'method must be bank_transfer (use crypto checkout for NOWPayments)' });
    return;
  }

  const allowed = normalizeAllowedBillingIntervals(tier.allowedBillingIntervals, {
    requiresPayment: true,
  });
  if (!allowed.includes(billingInterval)) {
    res.status(400).json({ error: `billingInterval must be one of: ${allowed.join(', ')}` });
    return;
  }

  const user = await User.findById(req.userId);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const promoCode = String(req.body.promoCode || '').trim();

  let checkout;
  try {
    checkout = await resolveSubscriptionCheckout(user, {
      planSlug: requestedPlan,
      interval: billingInterval,
      currency,
      promoCode,
    });
  } catch (e) {
    res.status(e.statusCode || 400).json({ error: e.message, code: e.code });
    return;
  }

  const { quote } = checkout;

  await PaymentRequest.create({
    userId: user._id,
    requestedPlan,
    billingInterval,
    currency,
    method: 'bank_transfer',
    payerReference,
    status: 'pending',
    listAmount: quote.listAmount,
    creditAmount: quote.creditAmount,
    amountDue: quote.amountDue,
    chargeType: quote.chargeType,
    promoCode: quote.promoCode || '',
    promoDiscount: quote.promoDiscount || 0,
    accountCreditApplied: quote.accountCreditApplied || 0,
  });

  res.status(201).json({ ok: true, quote });
});

exports.postSubscriptionQuote = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const planSlug = String(req.body.planSlug || req.body.plan || '').toLowerCase().trim();
  const interval = normalizeInterval(req.body.interval || req.body.billingInterval);
  const currency = normalizeCurrency(req.body.currency);

  const tier = await Plan.findOne({
    slug: planSlug,
    isActive: true,
    requiresPaymentSubscription: true,
  }).lean();
  if (!tier) {
    res.status(400).json({ error: 'Invalid or unavailable plan' });
    return;
  }

  const allowed = normalizeAllowedBillingIntervals(tier.allowedBillingIntervals, {
    requiresPayment: true,
  });
  if (!allowed.includes(interval)) {
    res.status(400).json({ error: `billingInterval must be one of: ${allowed.join(', ')}` });
    return;
  }

  const promoCode = String(req.body.promoCode || '').trim();

  let checkout;
  try {
    checkout = await resolveSubscriptionCheckout(user, { planSlug, interval, currency, promoCode });
  } catch (e) {
    res.status(e.statusCode || 400).json({ error: e.message, code: e.code });
    return;
  }

  res.json({
    ...checkout.quote,
    allowedBillingIntervals: allowed,
    fiatCurrencies: VALID_CURRENCIES,
    accountCreditBalance: user.accountCredit?.[currency] || 0,
  });
});

exports.activateZeroAmountCheckout = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const planSlug = String(req.body.planSlug || req.body.plan || '').toLowerCase().trim();
  const interval = normalizeInterval(req.body.interval || req.body.billingInterval);
  const currency = normalizeCurrency(req.body.currency);
  const promoCode = String(req.body.promoCode || '').trim();

  let checkout;
  try {
    checkout = await resolveSubscriptionCheckout(user, { planSlug, interval, currency, promoCode });
  } catch (e) {
    res.status(e.statusCode || 400).json({ error: e.message, code: e.code });
    return;
  }

  if (checkout.priceAmount > 0) {
    res.status(400).json({ error: 'Payment is required for this checkout.' });
    return;
  }

  const { applySubscriptionActivation } = require('../lib/subscriptionLifecycle');
  const { applyCheckoutBalances } = require('../lib/subscriptionCheckout');

  await applySubscriptionActivation(user._id, {
    planSlug: checkout.planSlug,
    billingInterval: checkout.billingInterval,
    chargeType: checkout.chargeType,
    amountCharged: 0,
    creditApplied: checkout.quote.creditAmount || 0,
    paymentRef: { kind: 'promo', id: checkout.quote.promoCode || 'credit' },
    metadata: { promoCode: checkout.quote.promoCode, accountCreditApplied: checkout.quote.accountCreditApplied },
  });

  await applyCheckoutBalances(user._id, {
    promoCode: checkout.quote.promoCode,
    accountCreditApplied: checkout.quote.accountCreditApplied,
    currency,
  });

  res.json({ ok: true, activated: true });
});

exports.scheduleSubscriptionDowngrade = asyncHandler(async (req, res) => {
  const planSlug = String(req.body.planSlug || req.body.plan || '').toLowerCase().trim();
  const result = await scheduleDowngrade(req.userId, planSlug);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(result);
});

exports.getSubscriptionHistory = asyncHandler(async (req, res) => {
  const limit = Number(req.query.limit) || 50;
  const data = await subscriptionHistoryForUser(req.userId, { limit });
  res.json(data);
});

exports.cancelScheduledDowngrade = asyncHandler(async (req, res) => {
  const result = await cancelScheduledDowngrade(req.userId);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(result);
});

exports.listPaymentRequests = asyncHandler(async (req, res) => {
  const userOid = new mongoose.Types.ObjectId(req.userId);
  const rows = await PaymentRequest.find({ userId: userOid }).sort({ createdAt: -1 }).limit(50).lean();
  res.json({
    requests: rows.map((p) => ({
      id: p._id.toString(),
      requestedPlan: p.requestedPlan,
      billingInterval: normalizeInterval(p.billingInterval),
      currency: normalizeCurrency(p.currency),
      method: p.method,
      status: p.status,
      payerReference: p.payerReference || '',
      adminNote: p.adminNote || '',
      createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : null,
      decidedAt: p.decidedAt ? new Date(p.decidedAt).toISOString() : null,
    })),
  });
});

exports.createCryptoCheckout = asyncHandler(async (req, res) => {
  if (!(await isNowPaymentsConfigured())) {
    billingDisabledResponse(res);
    return;
  }
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const planSlug = String(req.body.planSlug || req.body.plan || '').toLowerCase().trim();
  const interval = normalizeInterval(req.body.interval || req.body.billingInterval);
  const currency = normalizeCurrency(req.body.currency);

  const promoCode = String(req.body.promoCode || '').trim();

  try {
    const session = await createSubscriptionInvoice(user, {
      planSlug,
      interval,
      currency,
      successUrl: req.body.successUrl,
      cancelUrl: req.body.cancelUrl,
      promoCode,
    });
    res.json(session);
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

exports.updateSubscriptionCancel = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { effectivePlan } = await entitlementLimits(user);
  if (effectivePlan === 'free') {
    res.status(400).json({ error: 'No active paid subscription to cancel.' });
    return;
  }

  if (req.body.cancelAtPeriodEnd !== undefined) {
    user.cancelAtPeriodEnd = !!req.body.cancelAtPeriodEnd;
  } else {
    user.cancelAtPeriodEnd = !user.cancelAtPeriodEnd;
  }
  await user.save();

  res.json({
    ok: true,
    cancelAtPeriodEnd: user.cancelAtPeriodEnd,
    subscriptionPaidThrough: user.subscriptionPaidThrough
      ? new Date(user.subscriptionPaidThrough).toISOString()
      : null,
  });
});

exports.getQuote = asyncHandler(async (req, res) => {
  const planSlug = String(req.query.planSlug || req.query.plan || '').toLowerCase().trim();
  const interval = normalizeInterval(req.query.interval || req.query.billingInterval);
  const currency = normalizeCurrency(req.query.currency);

  const tier = await Plan.findOne({
    slug: planSlug,
    isActive: true,
    requiresPaymentSubscription: true,
  }).lean();
  if (!tier) {
    res.status(400).json({ error: 'Invalid or unavailable plan' });
    return;
  }

  const allowed = normalizeAllowedBillingIntervals(tier.allowedBillingIntervals, {
    requiresPayment: true,
  });
  if (!allowed.includes(interval)) {
    res.status(400).json({ error: `billingInterval must be one of: ${allowed.join(', ')}` });
    return;
  }

  const quote = quoteForPlan(planSlug, interval, currency);
  if (!quote) {
    res.status(400).json({ error: 'Price not available for this combination' });
    return;
  }

  res.json({
    ...quote,
    allowedBillingIntervals: allowed,
    fiatCurrencies: VALID_CURRENCIES,
  });
});

exports.getCryptoPaymentStatus = asyncHandler(async (req, res) => {
  const orderId = String(req.params.orderId || '').trim();
  const record = await CryptoPayment.findOne({ orderId, userId: req.userId }).lean();
  if (!record) {
    res.status(404).json({ error: 'Payment not found' });
    return;
  }
  res.json({
    orderId: record.orderId,
    paymentStatus: record.paymentStatus,
    invoiceUrl: record.invoiceUrl,
    planSlug: record.planSlug,
    billingInterval: record.billingInterval,
  });
});

exports.createFlutterwaveCheckout = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const planSlug = String(req.body.planSlug || req.body.plan || '').toLowerCase().trim();
  const interval = normalizeInterval(req.body.interval || req.body.billingInterval);
  const currency = normalizeCurrency(req.body.currency);
  const promoCode = String(req.body.promoCode || '').trim();
  try {
    const session = await createFlutterwaveCheckout(user, { planSlug, interval, currency, promoCode });
    res.json(session);
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

exports.confirmFlutterwaveCheckout = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const orderId = String(req.body.orderId || '').trim();
  const transactionId = String(req.body.transactionId || req.body.transaction_id || '').trim();
  if (!orderId || !transactionId) {
    res.status(400).json({ error: 'orderId and transactionId are required' });
    return;
  }
  try {
    const result = await confirmFlutterwavePayment(user, { orderId, transactionId });
    res.json(result);
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

exports.createSquadCheckout = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const planSlug = String(req.body.planSlug || req.body.plan || '').toLowerCase().trim();
  const interval = normalizeInterval(req.body.interval || req.body.billingInterval);
  const currency = normalizeCurrency(req.body.currency);
  const successUrl = req.body.successUrl;
  const promoCode = String(req.body.promoCode || '').trim();
  const clientOrigin = resolveClientOrigin(req);
  try {
    const session = await createSquadCheckout(user, {
      planSlug,
      interval,
      currency,
      successUrl,
      promoCode,
      clientOrigin,
    });
    res.json(session);
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

exports.confirmSquadCheckout = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const orderId = String(req.body.orderId || '').trim();
  const transactionRef = String(
    req.body.transactionRef || req.body.transaction_ref || '',
  ).trim();
  if (!orderId) {
    res.status(400).json({ error: 'orderId is required' });
    return;
  }
  try {
    const result = await confirmSquadPayment(user, { orderId, transactionRef });
    res.json(result);
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

exports.createStripeCheckout = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const planSlug = String(req.body.planSlug || req.body.plan || '').toLowerCase().trim();
  const interval = normalizeInterval(req.body.interval || req.body.billingInterval);
  const currency = normalizeCurrency(req.body.currency);
  const successUrl = req.body.successUrl;
  const cancelUrl = req.body.cancelUrl;
  const promoCode = String(req.body.promoCode || '').trim();
  const clientOrigin = resolveClientOrigin(req);
  try {
    const session = await createStripeCheckout(user, {
      planSlug,
      interval,
      currency,
      successUrl,
      cancelUrl,
      promoCode,
      clientOrigin,
    });
    res.json(session);
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

exports.confirmStripeCheckout = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const orderId = String(req.body.orderId || '').trim();
  const sessionId = String(req.body.sessionId || req.body.session_id || '').trim();
  if (!orderId) {
    res.status(400).json({ error: 'orderId is required' });
    return;
  }
  try {
    const result = await confirmStripePayment(user, { orderId, sessionId });
    res.json(result);
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

exports.getGatewayPaymentStatus = asyncHandler(async (req, res) => {
  const orderId = String(req.params.orderId || '').trim();
  const record = await findGatewayPaymentByOrderId(orderId, req.userId);
  if (!record) {
    res.status(404).json({ error: 'Payment not found' });
    return;
  }
  res.json({
    orderId: record.orderId,
    provider: record.provider,
    paymentStatus: record.paymentStatus,
    planSlug: record.planSlug,
    billingInterval: record.billingInterval,
    checkoutUrl: record.checkoutUrl || '',
  });
});
