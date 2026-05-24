const User = require('../models/User');
const SubscriptionEvent = require('../models/SubscriptionEvent');
const { effectiveSubscriptionPlan } = require('./entitlements');
const { intervalToMonths, normalizeInterval } = require('./billingIntervals');
function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

const PLAN_RANK = { free: 0, pro: 1, studio: 2 };

function planRank(slug) {
  const s = String(slug || 'free').toLowerCase().trim();
  return PLAN_RANK[s] ?? 0;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / (24 * 60 * 60 * 1000));
}

function derivePeriodStart(user) {
  if (user.subscriptionPeriodStart) {
    return new Date(user.subscriptionPeriodStart);
  }
  if (user.subscriptionPaidThrough && user.subscriptionBillingInterval) {
    const months = intervalToMonths(user.subscriptionBillingInterval);
    return addMonths(new Date(user.subscriptionPaidThrough), -months);
  }
  return null;
}

function getSubscriptionState(user) {
  const stored =
    typeof user.subscriptionPlan === 'string' ? user.subscriptionPlan.toLowerCase().trim() : 'free';
  const effective = effectiveSubscriptionPlan(user);
  const paidThrough = user.subscriptionPaidThrough ? new Date(user.subscriptionPaidThrough) : null;
  const now = new Date();
  const isActive = effective !== 'free' && paidThrough && paidThrough > now;
  const daysRemaining =
    isActive && paidThrough ? Math.max(0, daysBetween(now, paidThrough)) : 0;

  return {
    storedPlan: stored,
    effectivePlan: effective,
    subscriptionStatus: user.subscriptionStatus || 'none',
    subscriptionPaidThrough: paidThrough ? paidThrough.toISOString() : null,
    subscriptionPeriodStart: derivePeriodStart(user)?.toISOString() || null,
    subscriptionBillingInterval: user.subscriptionBillingInterval || null,
    cancelAtPeriodEnd: !!user.cancelAtPeriodEnd,
    scheduledPlanSlug: user.scheduledPlanSlug || null,
    scheduledChangeAt: user.scheduledChangeAt
      ? new Date(user.scheduledChangeAt).toISOString()
      : null,
    isActive,
    isLapsed: stored !== 'free' && !isActive,
    daysRemaining,
    planRank: planRank(stored),
  };
}

async function recordSubscriptionEvent(userId, payload) {
  return SubscriptionEvent.create({
    userId,
    type: payload.type,
    fromPlan: payload.fromPlan || '',
    toPlan: payload.toPlan || '',
    billingInterval: payload.billingInterval || '',
    currency: payload.currency || '',
    amountCharged: payload.amountCharged ?? 0,
    creditApplied: payload.creditApplied ?? 0,
    paidThroughBefore: payload.paidThroughBefore || null,
    paidThroughAfter: payload.paidThroughAfter || null,
    paymentRef: payload.paymentRef || { kind: '', id: '' },
    metadata: payload.metadata || {},
  });
}

/**
 * Apply prepaid subscription after successful payment.
 * Extends paidThrough from current end when still active (renewal stacking).
 */
async function applySubscriptionActivation(
  userId,
  {
    planSlug,
    billingInterval,
    paidThrough,
    eventType,
    paymentRef,
    metadata,
    chargeType,
    amountCharged,
    creditApplied,
  } = {},
) {
  const user = await User.findById(userId);
  if (!user) return null;

  const interval = normalizeInterval(billingInterval);
  const months = intervalToMonths(interval);
  const now = new Date();
  const fromPlan = (user.subscriptionPlan || 'free').toLowerCase().trim();
  const targetPlan = String(planSlug).toLowerCase().trim();
  const paidThroughBefore = user.subscriptionPaidThrough
    ? new Date(user.subscriptionPaidThrough)
    : null;

  const hadActive =
    paidThroughBefore && !Number.isNaN(paidThroughBefore.getTime()) && paidThroughBefore > now;

  const isUpgrade =
    chargeType === 'upgrade' ||
    (hadActive && planRank(targetPlan) > planRank(fromPlan) && planRank(fromPlan) > 0);

  let through;
  let type = eventType;

  if (isUpgrade && hadActive) {
    through = paidThroughBefore;
    user.subscriptionPlan = targetPlan;
    user.subscriptionStatus = 'active';
    user.subscriptionBillingInterval = interval;
    user.subscriptionPaidThrough = through;
    user.cancelAtPeriodEnd = false;
    user.scheduledPlanSlug = null;
    user.scheduledChangeAt = null;
    type = type || 'upgraded';
  } else {
    const base = hadActive ? paidThroughBefore : now;
    through = paidThrough ? new Date(paidThrough) : addMonths(base, months);

    if (!hadActive) {
      user.subscriptionPeriodStart = now;
    } else if (base.getTime() === paidThroughBefore.getTime()) {
      user.subscriptionPeriodStart = paidThroughBefore;
    }

    user.subscriptionPlan = targetPlan;
    user.subscriptionStatus = 'active';
    user.subscriptionBillingInterval = interval;
    user.subscriptionPaidThrough = through;
    user.cancelAtPeriodEnd = false;
    user.scheduledPlanSlug = null;
    user.scheduledChangeAt = null;

    if (!type) {
      if (fromPlan === 'free' || !hadActive) type = 'activated';
      else if (fromPlan === targetPlan) type = 'renewed';
      else type = 'activated';
    }
  }

  user.lastSubscriptionEventAt = now;
  await user.save();

  await recordSubscriptionEvent(userId, {
    type,
    fromPlan,
    toPlan: user.subscriptionPlan,
    billingInterval: interval,
    amountCharged: amountCharged ?? 0,
    creditApplied: creditApplied ?? 0,
    paidThroughBefore,
    paidThroughAfter: through,
    paymentRef,
    metadata,
  });

  return user;
}

async function scheduleDowngrade(userId, targetPlanSlug) {
  const user = await User.findById(userId);
  if (!user) return { ok: false, error: 'User not found' };

  const state = getSubscriptionState(user);
  if (!state.isActive) {
    return { ok: false, error: 'No active subscription to downgrade.' };
  }

  const target = String(targetPlanSlug || 'free').toLowerCase().trim();
  if (planRank(target) >= planRank(state.effectivePlan)) {
    return { ok: false, error: 'Target plan must be lower than your current plan.' };
  }

  const changeAt = user.subscriptionPaidThrough ? new Date(user.subscriptionPaidThrough) : new Date();
  user.scheduledPlanSlug = target;
  user.scheduledChangeAt = changeAt;
  await user.save();

  await recordSubscriptionEvent(user._id, {
    type: 'downgrade_scheduled',
    fromPlan: state.effectivePlan,
    toPlan: target,
    billingInterval: user.subscriptionBillingInterval || '',
    paidThroughBefore: user.subscriptionPaidThrough,
    paidThroughAfter: user.subscriptionPaidThrough,
    metadata: { scheduledChangeAt: changeAt.toISOString() },
  });

  try {
    const { upsertNotification } = require('../services/notificationService');
    const ptKey = changeAt.toISOString().slice(0, 10);
    await upsertNotification(user._id, {
      category: 'subscription',
      type: 'subscription_downgrade_scheduled',
      dedupKey: `subscription:downgrade_scheduled:${ptKey}:${target}`,
      title: `Switching to ${target.charAt(0).toUpperCase() + target.slice(1)} soon`,
      body: `Your plan will change on ${changeAt.toLocaleDateString(undefined, { dateStyle: 'medium' })}. You keep your current features until then.`,
      linkUrl: '/dashboard/billing',
      meta: { scheduledPlanSlug: target, scheduledChangeAt: changeAt.toISOString() },
    });
  } catch {
    /* notifications optional */
  }

  return {
    ok: true,
    scheduledPlanSlug: target,
    scheduledChangeAt: changeAt.toISOString(),
  };
}

async function cancelScheduledDowngrade(userId) {
  const user = await User.findById(userId);
  if (!user) return { ok: false, error: 'User not found' };

  if (!user.scheduledPlanSlug) {
    return { ok: false, error: 'No scheduled plan change.' };
  }

  user.scheduledPlanSlug = null;
  user.scheduledChangeAt = null;
  await user.save();
  return { ok: true };
}

async function expireSubscriptions() {
  const now = new Date();
  const users = await User.find({
    subscriptionPlan: { $nin: ['', 'free'] },
    subscriptionPaidThrough: { $lte: now },
  });

  let processed = 0;

  for (const user of users) {
    const paidThroughBefore = user.subscriptionPaidThrough
      ? new Date(user.subscriptionPaidThrough)
      : null;
    const fromPlan = user.subscriptionPlan;

    if (user.cancelAtPeriodEnd) {
      user.subscriptionPlan = 'free';
      user.subscriptionStatus = 'canceled';
      user.subscriptionBillingInterval = null;
      user.cancelAtPeriodEnd = false;
      user.scheduledPlanSlug = null;
      user.scheduledChangeAt = null;
      await user.save();
      await recordSubscriptionEvent(user._id, {
        type: 'canceled',
        fromPlan,
        toPlan: 'free',
        paidThroughBefore,
        paidThroughAfter: null,
      });
      processed += 1;
      continue;
    }

    if (user.scheduledPlanSlug) {
      const toPlan = user.scheduledPlanSlug;
      user.subscriptionPlan = toPlan;
      user.subscriptionStatus = toPlan === 'free' ? 'none' : 'active';
      user.scheduledPlanSlug = null;
      user.scheduledChangeAt = null;
      if (toPlan === 'free') {
        user.subscriptionBillingInterval = null;
        user.subscriptionPaidThrough = null;
      }
      await user.save();
      await recordSubscriptionEvent(user._id, {
        type: 'downgrade_applied',
        fromPlan,
        toPlan,
        paidThroughBefore,
        paidThroughAfter: user.subscriptionPaidThrough,
      });
      processed += 1;
      continue;
    }

    if (user.subscriptionStatus !== 'expired') {
      user.subscriptionStatus = 'expired';
      await user.save();
      await recordSubscriptionEvent(user._id, {
        type: 'expired',
        fromPlan,
        toPlan: fromPlan,
        paidThroughBefore,
        paidThroughAfter: paidThroughBefore,
      });
      processed += 1;
    }
  }

  return { processed };
}

module.exports = {
  PLAN_RANK,
  planRank,
  getSubscriptionState,
  derivePeriodStart,
  applySubscriptionActivation,
  recordSubscriptionEvent,
  scheduleDowngrade,
  cancelScheduledDowngrade,
  expireSubscriptions,
  addMonths,
};
