const User = require('../models/User');
const Plan = require('../models/Plan');
const { normalizeCurrency } = require('./currencies');
const { normalizeInterval, normalizeAllowedBillingIntervals } = require('./billingIntervals');
const { quoteSubscriptionChange } = require('./subscriptionProration');
const { validateAndApplyPromo } = require('./promoCodes');
const { applyAccountCreditToQuote } = require('./accountCredit');

async function resolveSubscriptionCheckout(user, { planSlug, interval, currency, promoCode }) {
  const billingInterval = normalizeInterval(interval);
  const priceCurrency = normalizeCurrency(currency);
  const slug = String(planSlug || '').toLowerCase().trim();

  const plan = await Plan.findOne({
    slug,
    isActive: true,
    requiresPaymentSubscription: true,
  }).lean();
  if (!plan) {
    const err = new Error('Invalid or unavailable plan.');
    err.statusCode = 400;
    throw err;
  }

  const allowed = normalizeAllowedBillingIntervals(plan.allowedBillingIntervals, {
    requiresPayment: true,
  });
  if (!allowed.includes(billingInterval)) {
    const err = new Error(`billingInterval must be one of: ${allowed.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }

  let quote = quoteSubscriptionChange(user, {
    planSlug: slug,
    interval: billingInterval,
    currency: priceCurrency,
  });

  if (!quote.allowed) {
    const err = new Error(quote.message || 'This plan change is not allowed.');
    err.statusCode = 400;
    err.code = quote.error;
    throw err;
  }

  if (promoCode) {
    const promo = await validateAndApplyPromo({
      code: promoCode,
      planSlug: slug,
      interval: billingInterval,
      currency: priceCurrency,
      amountDue: quote.amountDue,
    });
    if (!promo.valid) {
      const err = new Error(promo.error || 'Invalid promo code');
      err.statusCode = 400;
      throw err;
    }
    quote = {
      ...quote,
      promoCode: promo.code,
      promoDiscount: promo.promoDiscount,
      promoDisplay: promo.promoDisplay,
      amountDue: promo.amountDue,
      amountDisplay: require('./currencies').formatMoney(promo.amountDue, priceCurrency),
    };
  }

  quote = applyAccountCreditToQuote(quote, user);

  if (quote.amountDue <= 0 && quote.chargeType === 'upgrade' && !quote.promoCode && !quote.accountCreditApplied) {
    const err = new Error('No payment required for this upgrade.');
    err.statusCode = 400;
    throw err;
  }

  return {
    plan,
    planSlug: slug,
    billingInterval,
    priceCurrency,
    priceAmount: quote.amountDue,
    listAmount: quote.listAmount,
    creditAmount: quote.creditAmount,
    promoCode: quote.promoCode || '',
    promoDiscount: quote.promoDiscount || 0,
    accountCreditApplied: quote.accountCreditApplied || 0,
    chargeType: quote.chargeType,
    quote,
  };
}

async function applyCheckoutBalances(userId, { promoCode, accountCreditApplied, currency }) {
  const user = await User.findById(userId);
  if (!user) return;

  const cur = normalizeCurrency(currency);
  const creditUsed = Number(accountCreditApplied) || 0;
  if (creditUsed > 0 && user.accountCredit) {
    user.accountCredit[cur] = Math.max(0, (Number(user.accountCredit[cur]) || 0) - creditUsed);
    user.markModified('accountCredit');
    await user.save();
  }

  if (promoCode) {
    const { incrementPromoRedemption } = require('./promoCodes');
    await incrementPromoRedemption(promoCode);
  }
}

module.exports = { resolveSubscriptionCheckout, applyCheckoutBalances };
