const crypto = require('crypto');
const User = require('../models/User');
const BioProfile = require('../models/BioProfile');
const { isNowPaymentsConfigured, billingDisabledResponse } = require('../lib/nowpaymentsClient');
const { createProductInvoice } = require('../services/nowpaymentsBilling');
const { summaryForUsername, ordersForUsername } = require('../services/commerceRollup');
const { entitlementLimits } = require('../lib/entitlements');
const config = require('../config');
const { asyncHandler } = require('../middleware/errorHandler');

async function loadCommerceContext(req) {
  const profile = req.profile;
  const user = await User.findById(req.userId).lean();
  const { limits, effectivePlan } = user
    ? await entitlementLimits(user)
    : { limits: { advancedAnalytics: false }, effectivePlan: 'free' };
  return { profile, limits, effectivePlan };
}

exports.productCheckout = asyncHandler(async (req, res) => {
  if (!(await isNowPaymentsConfigured())) {
    billingDisabledResponse(res);
    return;
  }

  const username = String(req.body.username || req.params.username || '').toLowerCase().trim();
  const productId = String(req.body.productId || '').trim();
  if (!username || !productId) {
    res.status(400).json({ error: 'username and productId required.' });
    return;
  }

  const profile = await BioProfile.findOne({ username }).lean();
  if (!profile?.published) {
    res.status(404).json({ error: 'Published profile not found.' });
    return;
  }

  const published = profile.published;
  const product = (published.productCards || []).find((p) => p.id === productId);
  if (!product) {
    res.status(404).json({ error: 'Product not found.' });
    return;
  }

  const priceMatch = String(product.price || '').match(/[\d.]+/);
  const priceAmount = priceMatch ? Math.max(1, parseFloat(priceMatch[0])) : 0;
  if (!priceAmount) {
    res.status(400).json({ error: 'Product has no valid price.' });
    return;
  }

  const orderId = `lb_prod_${username}_${productId}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const base = config.clientOrigin.replace(/\/$/, '');

  try {
    const session = await createProductInvoice({
      priceAmount,
      orderId,
      description: `${published.name || username} — ${product.title || 'Product'}`,
      successUrl: req.body.successUrl || `${base}/@${username}?paid=1`,
      cancelUrl: req.body.cancelUrl || `${base}/@${username}`,
      meta: { productId, username, userId: profile.userId },
    });
    res.json(session);
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

exports.summary = asyncHandler(async (req, res) => {
  const ctx = await loadCommerceContext(req);
  const range = Math.min(90, Math.max(1, Number(req.query.range) || 30));

  if (!ctx.limits.advancedAnalytics) {
    res.json({
      rangeDays: range,
      revenue: 0,
      orderCount: 0,
      topProducts: [],
      advancedLocked: true,
      effectivePlan: ctx.effectivePlan,
      profileId: ctx.profile._id.toString(),
      username: ctx.profile.username,
    });
    return;
  }

  const data = await summaryForUsername(ctx.profile.username, range);
  res.json({
    ...data,
    advancedLocked: false,
    effectivePlan: ctx.effectivePlan,
    profileId: ctx.profile._id.toString(),
    username: ctx.profile.username,
  });
});

exports.orders = asyncHandler(async (req, res) => {
  const ctx = await loadCommerceContext(req);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));

  if (!ctx.limits.advancedAnalytics) {
    res.json({
      orders: [],
      advancedLocked: true,
      effectivePlan: ctx.effectivePlan,
      profileId: ctx.profile._id.toString(),
      username: ctx.profile.username,
    });
    return;
  }

  const orders = await ordersForUsername(ctx.profile.username, { limit });
  res.json({
    orders,
    advancedLocked: false,
    effectivePlan: ctx.effectivePlan,
    profileId: ctx.profile._id.toString(),
    username: ctx.profile.username,
  });
});
