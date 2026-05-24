const Plan = require('../models/Plan');
const { normalizeCurrency, formatMoney } = require('./currencies');
const { hasAnyPriceValue, pricesMatrixToTier, amountFromTier } = require('./planPrices');

/** Fallback when DB has no prices for a slug (dev / migration). */
const PLAN_PRICES = {
  pro: {
    monthly: { usd: 10, eur: 9, gbp: 8 },
    quarterly: { usd: 27, eur: 25, gbp: 22 },
    yearly: { usd: 96, eur: 89, gbp: 76 },
  },
  studio: {
    monthly: { usd: 29, eur: 27, gbp: 23 },
    quarterly: { usd: 78, eur: 73, gbp: 62 },
    yearly: { usd: 288, eur: 268, gbp: 228 },
  },
};

/** @deprecated */
const PLAN_USD = {
  pro: { monthly: 10, yearly: 96 },
  studio: { monthly: 29, yearly: 288 },
};

/** In-memory cache populated from MongoDB (refreshed on connect + admin edits). */
let dbPriceCache = null;

async function refreshPlanPriceCache() {
  const plans = await Plan.find({ requiresPaymentSubscription: true })
    .select('slug prices')
    .lean();
  const cache = {};
  for (const p of plans) {
    if (!hasAnyPriceValue(p.prices)) continue;
    const tier = pricesMatrixToTier(p.prices);
    if (tier) cache[p.slug] = tier;
  }
  dbPriceCache = Object.keys(cache).length ? cache : null;
}

function tierForSlug(slug) {
  if (dbPriceCache && dbPriceCache[slug]) return dbPriceCache[slug];
  return PLAN_PRICES[slug] || null;
}

function priceForPlan(slug, interval, currency = 'usd') {
  const tier = tierForSlug(slug);
  return amountFromTier(tier, interval, currency);
}

function priceUsdForPlan(slug, interval) {
  return priceForPlan(slug, interval, 'usd');
}

function quoteForPlan(slug, interval, currency = 'usd') {
  const amount = priceForPlan(slug, interval, currency);
  const c = normalizeCurrency(currency);
  if (amount == null) return null;
  return {
    planSlug: slug,
    billingInterval: interval,
    currency: c,
    amount,
    display: formatMoney(amount, c),
  };
}

module.exports = {
  PLAN_PRICES,
  PLAN_USD,
  refreshPlanPriceCache,
  priceForPlan,
  priceUsdForPlan,
  quoteForPlan,
};
