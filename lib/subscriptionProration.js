const { quoteForPlan, priceForPlan } = require('./planPricing');
const { normalizeCurrency, formatMoney } = require('./currencies');
const { normalizeInterval, intervalToMonths } = require('./billingIntervals');
const { getSubscriptionState, derivePeriodStart, planRank, addMonths } = require('./subscriptionLifecycle');

function roundMoney(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function computeRemainingCredit(user, currency) {
  const c = normalizeCurrency(currency);
  const state = getSubscriptionState(user);
  if (!state.isActive || !user.subscriptionPaidThrough) return 0;

  const paidThrough = new Date(user.subscriptionPaidThrough);
  const now = new Date();
  if (paidThrough <= now) return 0;

  const periodStart = derivePeriodStart(user);
  if (!periodStart) return 0;

  const totalMs = paidThrough.getTime() - periodStart.getTime();
  const remainingMs = paidThrough.getTime() - now.getTime();
  if (totalMs <= 0 || remainingMs <= 0) return 0;

  const fraction = Math.min(1, remainingMs / totalMs);
  const currentPlan = state.effectivePlan;
  const interval = user.subscriptionBillingInterval || 'monthly';
  const currentPrice = priceForPlan(currentPlan, interval, c);
  if (!currentPrice || currentPrice <= 0) return 0;

  return roundMoney(currentPrice * fraction);
}

/**
 * @returns subscription change quote for checkout
 */
function quoteSubscriptionChange(user, { planSlug, interval, currency }) {
  const targetPlan = String(planSlug || '').toLowerCase().trim();
  const targetInterval = normalizeInterval(interval);
  const priceCurrency = normalizeCurrency(currency);
  const state = getSubscriptionState(user);

  const listQuote = quoteForPlan(targetPlan, targetInterval, priceCurrency);
  if (!listQuote) {
    return { allowed: false, error: 'Price not available for this combination' };
  }

  const listAmount = listQuote.amount;
  const base = {
    planSlug: targetPlan,
    billingInterval: targetInterval,
    currency: priceCurrency,
    listAmount,
    listDisplay: listQuote.display,
    creditAmount: 0,
    creditDisplay: formatMoney(0, priceCurrency),
    amountDue: listAmount,
    amountDisplay: listQuote.display,
    chargeType: 'new',
    allowed: true,
    paidThroughAfter: null,
    currentPlan: state.effectivePlan,
    isActive: state.isActive,
    scheduledPlanSlug: state.scheduledPlanSlug,
  };

  const targetRank = planRank(targetPlan);
  const currentRank = planRank(state.effectivePlan);

  if (state.isActive && targetRank < currentRank) {
    return {
      ...base,
      allowed: false,
      error: 'downgrade_not_allowed',
      message:
        'Downgrades take effect at the end of your billing period. Schedule a downgrade from Billing instead of checking out.',
    };
  }

  if (!state.isActive) {
    const through = addMonths(new Date(), intervalToMonths(targetInterval));
    return {
      ...base,
      chargeType: 'new',
      paidThroughAfter: through.toISOString(),
    };
  }

  if (targetRank > currentRank) {
    const currentInterval = user.subscriptionBillingInterval || 'monthly';
    if (targetInterval !== currentInterval) {
      return {
        ...base,
        allowed: false,
        error: 'interval_change_blocked',
        message:
          'Mid-cycle upgrades must use the same billing interval as your current plan. Change interval after your period ends.',
      };
    }

    const creditAmount = computeRemainingCredit(user, priceCurrency);
    const amountDue = roundMoney(Math.max(0, listAmount - creditAmount));

    return {
      ...base,
      chargeType: 'upgrade',
      creditAmount,
      creditDisplay: formatMoney(creditAmount, priceCurrency),
      amountDue,
      amountDisplay: formatMoney(amountDue, priceCurrency),
      paidThroughAfter: state.subscriptionPaidThrough,
      message:
        creditAmount > 0
          ? `Credit applied for unused time on your ${state.effectivePlan} plan.`
          : null,
    };
  }

  if (targetPlan === state.effectivePlan) {
    const baseDate =
      user.subscriptionPaidThrough && new Date(user.subscriptionPaidThrough) > new Date()
        ? new Date(user.subscriptionPaidThrough)
        : new Date();
    const months = intervalToMonths(targetInterval);
    const through = addMonths(baseDate, months);

    return {
      ...base,
      chargeType: 'renewal',
      paidThroughAfter: through.toISOString(),
    };
  }

  return {
    ...base,
    allowed: false,
    error: 'invalid_change',
    message: 'This plan change is not available for checkout.',
  };
}

module.exports = {
  roundMoney,
  computeRemainingCredit,
  quoteSubscriptionChange,
};
