const PromoCode = require('../models/PromoCode');
const { normalizeCurrency, formatMoney } = require('./currencies');
const { normalizeInterval } = require('./billingIntervals');
const { roundMoney } = require('./subscriptionProration');

async function findPromoCode(raw) {
  const code = String(raw || '')
    .trim()
    .toUpperCase();
  if (!code) return null;
  return PromoCode.findOne({ code, active: true }).lean();
}

function validatePromoForCheckout(promo, { planSlug, interval, currency }) {
  if (!promo) return { valid: false, error: 'Invalid promo code' };

  const now = new Date();
  if (promo.validFrom && new Date(promo.validFrom) > now) {
    return { valid: false, error: 'This promo code is not active yet' };
  }
  if (promo.validUntil && new Date(promo.validUntil) < now) {
    return { valid: false, error: 'This promo code has expired' };
  }
  if (promo.maxRedemptions != null && promo.redemptionCount >= promo.maxRedemptions) {
    return { valid: false, error: 'This promo code has reached its usage limit' };
  }

  const plans = Array.isArray(promo.planSlugs) ? promo.planSlugs : [];
  if (plans.length && !plans.includes(String(planSlug).toLowerCase())) {
    return { valid: false, error: 'Promo code does not apply to this plan' };
  }

  const intervals = Array.isArray(promo.billingIntervals) ? promo.billingIntervals : [];
  const iv = normalizeInterval(interval);
  if (intervals.length && !intervals.includes(iv)) {
    return { valid: false, error: 'Promo code does not apply to this billing interval' };
  }

  const cur = normalizeCurrency(currency);
  if (promo.discountType === 'amount' && promo.currency && promo.currency !== cur) {
    return { valid: false, error: `Promo applies to ${promo.currency.toUpperCase()} only` };
  }

  return { valid: true };
}

function computePromoDiscount(promo, amountDue, currency) {
  const cur = normalizeCurrency(currency);
  let discount = 0;
  if (promo.discountType === 'percent') {
    discount = roundMoney((amountDue * Math.min(100, promo.discountValue)) / 100);
  } else {
    discount = roundMoney(Math.min(amountDue, promo.discountValue));
  }
  const after = roundMoney(Math.max(0, amountDue - discount));
  return {
    promoDiscount: discount,
    amountDue: after,
    promoDisplay: `−${formatMoney(discount, cur)}`,
  };
}

async function validateAndApplyPromo({ code, planSlug, interval, currency, amountDue }) {
  const promo = await findPromoCode(code);
  const check = validatePromoForCheckout(promo, { planSlug, interval, currency });
  if (!check.valid) return { valid: false, error: check.error };

  const applied = computePromoDiscount(promo, amountDue, currency);
  return {
    valid: true,
    code: promo.code,
    promoDiscount: applied.promoDiscount,
    amountDue: applied.amountDue,
    promoDisplay: applied.promoDisplay,
    promo,
  };
}

async function incrementPromoRedemption(code) {
  const c = String(code || '').trim().toUpperCase();
  if (!c) return;
  await PromoCode.updateOne({ code: c }, { $inc: { redemptionCount: 1 } });
}

module.exports = {
  findPromoCode,
  validatePromoForCheckout,
  computePromoDiscount,
  validateAndApplyPromo,
  incrementPromoRedemption,
};
