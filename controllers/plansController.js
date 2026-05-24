const Plan = require('../models/Plan');
const { normalizeAllowedBillingIntervals } = require('../lib/billingIntervals');
const { asyncHandler } = require('../middleware/errorHandler');

function serializePublicPlan(p) {
  return {
    id: p._id.toString(),
    slug: p.slug,
    label: p.label,
    tagline: p.tagline || '',
    highlightBadge: p.highlightBadge || '',
    description: p.description || '',
    featureBullets: p.featureBullets || [],
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

exports.listPublic = asyncHandler(async (_req, res) => {
  const plans = await Plan.find({ isActive: true, showOnLanding: true })
    .sort({ sortOrder: 1, slug: 1 })
    .lean();
  res.json({ plans: plans.map(serializePublicPlan) });
});
