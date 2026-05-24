const PLANS = require('../config/plans');
const Plan = require('../models/Plan');
const PlatformSettings = require('../models/PlatformSettings');

let graceDaysCache = 0;
let graceCacheAt = 0;

async function getGraceDays() {
  if (Date.now() - graceCacheAt < 60_000) return graceDaysCache;
  try {
    const doc = await PlatformSettings.findById('global').select('subscriptionGraceDays').lean();
    graceDaysCache = Math.max(0, Math.min(30, Number(doc?.subscriptionGraceDays) || 0));
  } catch {
    graceDaysCache = 0;
  }
  graceCacheAt = Date.now();
  return graceDaysCache;
}

/** @returns {string} */
function effectiveSubscriptionPlan(user, { graceDays = 0 } = {}) {
  const stored =
    typeof user.subscriptionPlan === 'string' ? user.subscriptionPlan.toLowerCase().trim() : 'free';
  if (stored === 'free') return 'free';

  if (user.subscriptionPaidThrough) {
    const end = new Date(user.subscriptionPaidThrough).getTime();
    if (!Number.isNaN(end)) {
      if (end >= Date.now()) return stored;
      if (graceDays > 0) {
        const graceEnd = end + graceDays * 24 * 60 * 60 * 1000;
        if (graceEnd >= Date.now()) return stored;
      }
    }
  }

  const status = String(user.subscriptionStatus || '').toLowerCase();
  if (status === 'active') return stored;

  return 'free';
}

function staticLimitsForSlug(slug) {
  const s = slug && PLANS[slug] ? slug : 'free';
  return { slug: s, ...PLANS[s] };
}

async function limitsForEffectivePlan(effectivePlanSlug) {
  const slug = effectivePlanSlug || 'free';
  try {
    const doc = await Plan.findOne({ slug, isActive: true }).lean();
    if (doc) {
      return {
        slug: doc.slug,
        label: doc.label,
        maxProfiles: doc.maxProfiles ?? 1,
        maxBlocks: doc.maxBlocks,
        customDomains: doc.customDomains,
        advancedAnalytics: doc.advancedAnalytics,
        premiumThemes: doc.premiumThemes,
        hideWatermarkAllowed: doc.hideWatermarkAllowed,
        commercePlatformFeePercent: doc.commercePlatformFeePercent,
        teamWorkspaces: doc.teamWorkspaces,
        apiAccess: doc.apiAccess,
      };
    }
  } catch {
    /* DB not ready */
  }
  return staticLimitsForSlug(slug);
}

async function entitlementLimits(user) {
  const stored =
    typeof user.subscriptionPlan === 'string' ? user.subscriptionPlan.toLowerCase().trim() : 'free';
  const graceDays = await getGraceDays();
  const effective = effectiveSubscriptionPlan(user, { graceDays });
  const limits = await limitsForEffectivePlan(effective);
  return { effectivePlan: effective, limits, storedPlan: stored, graceDays };
}

module.exports = {
  effectiveSubscriptionPlan,
  limitsForEffectivePlan,
  entitlementLimits,
  staticLimitsForSlug,
  PLANS,
};
