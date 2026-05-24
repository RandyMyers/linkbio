const Plan = require('../models/Plan');
const User = require('../models/User');
const { asyncHandler } = require('../middleware/errorHandler');
const { normalizeAllowedBillingIntervals } = require('../lib/billingIntervals');
const {
  CURRENCIES,
  emptyPricesMatrix,
  hasAnyPriceValue,
  normalizePricesMatrix,
} = require('../lib/planPrices');
const { refreshPlanPriceCache } = require('../lib/planPricing');

const SLUG_RE = /^[a-z][a-z0-9-]{0,62}$/;

function adminShape(p) {
  const bullets = Array.isArray(p.featureBullets) ? p.featureBullets : [];
  return {
    id: p._id.toString(),
    slug: p.slug,
    label: p.label,
    tagline: p.tagline || '',
    highlightBadge: p.highlightBadge || '',
    description: p.description || '',
    featureBullets: bullets.map((x) => String(x)),
    priceDisplayMonthly: p.priceDisplayMonthly || '',
    priceDisplayYearly: p.priceDisplayYearly || '',
    maxProfiles: p.maxProfiles,
    maxBlocks: p.maxBlocks,
    customDomains: p.customDomains,
    advancedAnalytics: !!p.advancedAnalytics,
    premiumThemes: !!p.premiumThemes,
    hideWatermarkAllowed: !!p.hideWatermarkAllowed,
    commercePlatformFeePercent: p.commercePlatformFeePercent ?? 5,
    teamWorkspaces: !!p.teamWorkspaces,
    apiAccess: !!p.apiAccess,
    requiresPaymentSubscription: !!p.requiresPaymentSubscription,
    allowedBillingIntervals: normalizeAllowedBillingIntervals(p.allowedBillingIntervals, {
      requiresPayment: !!p.requiresPaymentSubscription,
    }),
    prices: normalizePricesMatrix(p.prices),
    isActive: !!p.isActive,
    showOnLanding: p.showOnLanding !== false,
    sortOrder: p.sortOrder ?? 0,
    createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : null,
    updatedAt: p.updatedAt ? new Date(p.updatedAt).toISOString() : null,
  };
}

function validatePaidPrices(slug, requiresPayment, prices) {
  if (!requiresPayment || slug === 'free') return null;
  if (!hasAnyPriceValue(prices)) {
    return 'Paid plans need at least one price (interval × currency).';
  }
  for (const interval of ['monthly', 'quarterly', 'yearly']) {
    const row = prices[interval];
    if (!row) continue;
    for (const c of CURRENCIES) {
      const v = row[c];
      if (v != null && (!Number.isFinite(v) || v <= 0)) {
        return `Invalid price for ${interval}.${c}`;
      }
    }
  }
  return null;
}

exports.listAll = asyncHandler(async (_req, res) => {
  const rows = await Plan.find({}).sort({ sortOrder: 1, slug: 1 }).lean();
  res.json({ plans: rows.map(adminShape) });
});

exports.getBySlug = asyncHandler(async (req, res) => {
  const slug = String(req.params.slug || '')
    .toLowerCase()
    .trim();
  if (!slug) {
    res.status(400).json({ error: 'Invalid slug' });
    return;
  }
  const plan = await Plan.findOne({ slug }).lean();
  if (!plan) {
    res.status(404).json({ error: 'Plan not found' });
    return;
  }
  res.json({ plan: adminShape(plan) });
});

exports.create = asyncHandler(async (req, res) => {
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const slug = String(b.slug || '')
    .toLowerCase()
    .trim();
  if (!slug || !SLUG_RE.test(slug)) {
    res.status(400).json({
      error: 'Invalid slug (lowercase letters, digits, hyphen; must start with a letter)',
    });
    return;
  }
  const label = String(b.label || '').trim();
  if (!label) {
    res.status(400).json({ error: 'label is required' });
    return;
  }

  const exists = await Plan.findOne({ slug }).lean();
  if (exists) {
    res.status(409).json({ error: 'A plan with this slug already exists' });
    return;
  }

  const requiresPaymentSubscription = Boolean(b.requiresPaymentSubscription);
  const prices = normalizePricesMatrix(b.prices || emptyPricesMatrix());
  const priceErr = validatePaidPrices(slug, requiresPaymentSubscription, prices);
  if (priceErr) {
    res.status(400).json({ error: priceErr });
    return;
  }

  const doc = await Plan.create({
    slug,
    label,
    tagline: String(b.tagline || '').trim().slice(0, 400),
    highlightBadge: String(b.highlightBadge || '').trim().slice(0, 80),
    description: String(b.description || '').trim().slice(0, 4000),
    featureBullets: Array.isArray(b.featureBullets)
      ? b.featureBullets.map((x) => String(x).trim()).filter(Boolean).slice(0, 30)
      : [],
    priceDisplayMonthly: String(b.priceDisplayMonthly || '').trim().slice(0, 40),
    priceDisplayYearly: String(b.priceDisplayYearly || '').trim().slice(0, 40),
    maxProfiles: Math.max(1, Math.floor(Number(b.maxProfiles ?? 1))),
    maxBlocks: Math.max(0, Math.floor(Number(b.maxBlocks ?? 50))),
    customDomains: Math.max(0, Math.floor(Number(b.customDomains ?? 0))),
    advancedAnalytics: Boolean(b.advancedAnalytics),
    premiumThemes: Boolean(b.premiumThemes),
    hideWatermarkAllowed: Boolean(b.hideWatermarkAllowed),
    commercePlatformFeePercent: Math.max(0, Number(b.commercePlatformFeePercent ?? 5)),
    teamWorkspaces: Boolean(b.teamWorkspaces),
    apiAccess: Boolean(b.apiAccess),
    requiresPaymentSubscription,
    allowedBillingIntervals: normalizeAllowedBillingIntervals(b.allowedBillingIntervals, {
      requiresPayment: requiresPaymentSubscription,
    }),
    prices,
    isActive: b.isActive === undefined ? true : Boolean(b.isActive),
    showOnLanding: b.showOnLanding === undefined ? true : Boolean(b.showOnLanding),
    sortOrder: Math.floor(Number(b.sortOrder ?? 0)) || 0,
  });

  await refreshPlanPriceCache();
  res.status(201).json({ plan: adminShape(doc.toObject({ flattenMaps: true })) });
});

exports.removeBySlug = asyncHandler(async (req, res) => {
  const slug = String(req.params.slug || '')
    .toLowerCase()
    .trim();
  if (!slug) {
    res.status(400).json({ error: 'Invalid slug' });
    return;
  }

  if (slug === 'free') {
    res.status(400).json({ error: 'Cannot delete the built-in free tier' });
    return;
  }

  const plan = await Plan.findOne({ slug });
  if (!plan) {
    res.status(404).json({ error: 'Plan not found' });
    return;
  }

  const subscribers = await User.countDocuments({ subscriptionPlan: slug });
  if (subscribers > 0) {
    res.status(409).json({
      error: `Cannot delete: ${subscribers} user(s) have subscriptionPlan "${slug}". Reassign them first.`,
    });
    return;
  }

  await Plan.deleteOne({ _id: plan._id });
  await refreshPlanPriceCache();
  res.status(204).end();
});

exports.patchBySlug = asyncHandler(async (req, res) => {
  const slug = String(req.params.slug || '')
    .toLowerCase()
    .trim();
  if (!slug) {
    res.status(400).json({ error: 'Invalid slug' });
    return;
  }

  const plan = await Plan.findOne({ slug });
  if (!plan) {
    res.status(404).json({ error: 'Plan not found' });
    return;
  }

  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const allowed = [
    'label',
    'tagline',
    'highlightBadge',
    'description',
    'featureBullets',
    'priceDisplayMonthly',
    'priceDisplayYearly',
    'maxProfiles',
    'maxBlocks',
    'customDomains',
    'advancedAnalytics',
    'premiumThemes',
    'hideWatermarkAllowed',
    'commercePlatformFeePercent',
    'teamWorkspaces',
    'apiAccess',
    'requiresPaymentSubscription',
    'allowedBillingIntervals',
    'prices',
    'isActive',
    'showOnLanding',
    'sortOrder',
  ];

  for (const key of allowed) {
    if (b[key] === undefined) continue;
    if (
      key === 'maxProfiles' ||
      key === 'maxBlocks' ||
      key === 'customDomains' ||
      key === 'commercePlatformFeePercent' ||
      key === 'sortOrder'
    ) {
      const n = Number(b[key]);
      if (!Number.isFinite(n) || n < 0) {
        res.status(400).json({ error: `Invalid ${key}` });
        return;
      }
      if (key === 'maxProfiles') plan[key] = Math.max(1, Math.floor(n));
      else if (key === 'sortOrder') plan[key] = Math.floor(n);
      else plan[key] = Math.floor(n);
    } else if (
      key === 'advancedAnalytics' ||
      key === 'premiumThemes' ||
      key === 'hideWatermarkAllowed' ||
      key === 'teamWorkspaces' ||
      key === 'apiAccess' ||
      key === 'requiresPaymentSubscription' ||
      key === 'isActive' ||
      key === 'showOnLanding'
    ) {
      plan[key] = Boolean(b[key]);
    } else if (key === 'allowedBillingIntervals') {
      plan[key] = normalizeAllowedBillingIntervals(b[key], {
        requiresPayment: !!plan.requiresPaymentSubscription,
      });
    } else if (key === 'featureBullets') {
      plan[key] = Array.isArray(b[key])
        ? b[key].map((x) => String(x).trim()).filter(Boolean).slice(0, 30)
        : [];
    } else if (key === 'prices') {
      plan.prices = normalizePricesMatrix(b[key]);
    } else {
      plan[key] = String(b[key] ?? '').trim().slice(0, key === 'description' ? 4000 : 400);
    }
  }

  if (!plan.requiresPaymentSubscription) {
    plan.allowedBillingIntervals = [];
  } else if (plan.allowedBillingIntervals.length === 0) {
    plan.allowedBillingIntervals = ['monthly', 'quarterly', 'yearly'];
  }

  const priceErr = validatePaidPrices(
    slug,
    plan.requiresPaymentSubscription,
    normalizePricesMatrix(plan.prices),
  );
  if (priceErr) {
    res.status(400).json({ error: priceErr });
    return;
  }

  if (slug === 'free' && b.isActive === false) {
    res.status(400).json({ error: 'Cannot deactivate the free tier' });
    return;
  }

  await plan.save();
  await refreshPlanPriceCache();
  res.json({ plan: adminShape(plan.toObject({ flattenMaps: true })) });
});
