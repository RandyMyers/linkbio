const Plan = require('../models/Plan');
const PLANS = require('../config/plans');
const { PLAN_PRICES } = require('./planPricing');
const { hasAnyPriceValue, normalizePricesMatrix } = require('./planPrices');

async function seedDefaultPlans() {
  const rows = [
    {
      slug: 'free',
      label: PLANS.free.label,
      description: 'Forever free — unlimited links and basic analytics.',
      maxProfiles: PLANS.free.maxProfiles,
      maxBlocks: PLANS.free.maxBlocks,
      customDomains: PLANS.free.customDomains,
      advancedAnalytics: PLANS.free.advancedAnalytics,
      premiumThemes: PLANS.free.premiumThemes,
      hideWatermarkAllowed: PLANS.free.hideWatermarkAllowed,
      commercePlatformFeePercent: PLANS.free.commercePlatformFeePercent,
      teamWorkspaces: PLANS.free.teamWorkspaces,
      apiAccess: PLANS.free.apiAccess,
      requiresPaymentSubscription: false,
      allowedBillingIntervals: [],
      isActive: true,
      sortOrder: 0,
      onInsert: {
        tagline: 'Forever, no card.',
        priceDisplayMonthly: '$0',
        priceDisplayYearly: '$0',
        featureBullets: [
          'Unlimited links',
          'Basic analytics',
          '5 themes',
          'LinkBio branding',
          'Email support',
        ],
        showOnLanding: true,
      },
    },
    {
      slug: 'pro',
      label: PLANS.pro.label,
      description: 'Advanced analytics, premium themes, custom domain, commerce.',
      maxProfiles: PLANS.pro.maxProfiles,
      maxBlocks: PLANS.pro.maxBlocks,
      customDomains: PLANS.pro.customDomains,
      advancedAnalytics: PLANS.pro.advancedAnalytics,
      premiumThemes: PLANS.pro.premiumThemes,
      hideWatermarkAllowed: PLANS.pro.hideWatermarkAllowed,
      commercePlatformFeePercent: PLANS.pro.commercePlatformFeePercent,
      teamWorkspaces: PLANS.pro.teamWorkspaces,
      apiAccess: PLANS.pro.apiAccess,
      requiresPaymentSubscription: true,
      allowedBillingIntervals: ['monthly', 'quarterly', 'yearly'],
      isActive: true,
      sortOrder: 10,
      onInsert: {
        tagline: '/month, billed yearly',
        highlightBadge: 'Popular',
        priceDisplayMonthly: '$10',
        priceDisplayYearly: '$8',
        featureBullets: [
          'Everything in Free',
          'Advanced analytics',
          '100+ premium themes',
          'Commerce (0% LinkBio fees)',
          'Custom domain',
          'Priority support',
        ],
        showOnLanding: true,
      },
    },
    {
      slug: 'studio',
      label: PLANS.studio.label,
      description: 'Teams, API access, and highest limits.',
      maxProfiles: PLANS.studio.maxProfiles,
      maxBlocks: PLANS.studio.maxBlocks,
      customDomains: PLANS.studio.customDomains,
      advancedAnalytics: PLANS.studio.advancedAnalytics,
      premiumThemes: PLANS.studio.premiumThemes,
      hideWatermarkAllowed: PLANS.studio.hideWatermarkAllowed,
      commercePlatformFeePercent: PLANS.studio.commercePlatformFeePercent,
      teamWorkspaces: PLANS.studio.teamWorkspaces,
      apiAccess: PLANS.studio.apiAccess,
      requiresPaymentSubscription: true,
      allowedBillingIntervals: ['monthly', 'quarterly', 'yearly'],
      isActive: true,
      sortOrder: 20,
      onInsert: {
        tagline: '/month per seat',
        priceDisplayMonthly: '$29',
        priceDisplayYearly: '$24',
        featureBullets: [
          'Everything in Pro',
          'Unlimited workspaces',
          'Team roles & approvals',
          'API access',
          'Dedicated CSM',
          'SSO + audit log',
        ],
        showOnLanding: true,
      },
    },
  ];

  for (const row of rows) {
    const { onInsert, ...core } = row;
    await Plan.updateOne(
      { slug: row.slug },
      {
        $set: core,
        $setOnInsert: onInsert,
      },
      { upsert: true },
    );
  }

  for (const slug of ['pro', 'studio']) {
    const fallback = PLAN_PRICES[slug];
    if (!fallback) continue;
    const doc = await Plan.findOne({ slug }).select('prices').lean();
    if (doc && hasAnyPriceValue(doc.prices)) continue;
    await Plan.updateOne(
      { slug },
      { $set: { prices: normalizePricesMatrix(fallback) } },
    );
  }
}

module.exports = { seedDefaultPlans };
