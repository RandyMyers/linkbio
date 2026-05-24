const User = require('../models/User');
const SubscriptionEvent = require('../models/SubscriptionEvent');
const SubscriptionSnapshot = require('../models/SubscriptionSnapshot');
const { intervalToMonths } = require('../lib/billingIntervals');
const { priceUsdForPlan } = require('../lib/planPricing');

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateKey(d) {
  return d.toISOString().slice(0, 10);
}

function monthlyValueUsd(plan, interval) {
  const amount = priceUsdForPlan(plan, interval || 'monthly');
  if (!amount || amount <= 0) return 0;
  const months = intervalToMonths(interval || 'monthly');
  return amount / months;
}

async function countActiveSubscriptions(now = new Date()) {
  return User.countDocuments({
    subscriptionPlan: { $nin: ['', 'free'] },
    subscriptionPaidThrough: { $gt: now },
  });
}

async function countFreeUsers(now = new Date()) {
  const total = await User.countDocuments();
  const active = await countActiveSubscriptions(now);
  return total - active;
}

async function countLapsedUsers(now = new Date()) {
  return User.countDocuments({
    subscriptionPlan: { $nin: ['', 'free'] },
    $or: [{ subscriptionPaidThrough: { $lte: now } }, { subscriptionPaidThrough: null }],
  });
}

async function estimateMrrUsd() {
  const users = await User.find({
    subscriptionPlan: { $nin: ['', 'free'] },
    subscriptionPaidThrough: { $gt: new Date() },
  })
    .select('subscriptionPlan subscriptionBillingInterval')
    .lean();

  let mrr = 0;
  for (const u of users) {
    mrr += monthlyValueUsd(u.subscriptionPlan, u.subscriptionBillingInterval);
  }
  return Number(mrr.toFixed(2));
}

async function subscriptionMetricsForRange(rangeDays = 30) {
  const range = Math.min(90, Math.max(1, Number(rangeDays) || 30));
  const since = daysAgo(range);
  const now = new Date();

  const [
    activeNow,
    freeUsers,
    lapsed,
    newActivations,
    renewals,
    upgrades,
    churnEvents,
    scheduledChanges,
    expiring7d,
    mrrUsd,
  ] = await Promise.all([
    countActiveSubscriptions(now),
    countFreeUsers(now),
    countLapsedUsers(now),
    SubscriptionEvent.countDocuments({ type: 'activated', createdAt: { $gte: since } }),
    SubscriptionEvent.countDocuments({ type: 'renewed', createdAt: { $gte: since } }),
    SubscriptionEvent.countDocuments({ type: 'upgraded', createdAt: { $gte: since } }),
    SubscriptionEvent.countDocuments({
      type: { $in: ['expired', 'canceled'] },
      createdAt: { $gte: since },
    }),
    User.countDocuments({ scheduledPlanSlug: { $ne: null } }),
    User.countDocuments({
      subscriptionPlan: { $nin: ['', 'free'] },
      subscriptionPaidThrough: {
        $gt: now,
        $lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      },
    }),
    estimateMrrUsd(),
  ]);

  const activeStart = await countActiveSubscriptions(since);
  const growthRate =
    activeStart > 0 ? Number((((activeNow - activeStart) / activeStart) * 100).toFixed(1)) : 0;
  const churnRate =
    activeStart > 0 ? Number(((churnEvents / activeStart) * 100).toFixed(1)) : 0;

  return {
    rangeDays: range,
    activeSubscriptions: activeNow,
    freeUsers,
    lapsedUsers: lapsed,
    scheduledChanges,
    expiringWithin7Days: expiring7d,
    mrrUsd,
    arrUsd: Number((mrrUsd * 12).toFixed(2)),
    newSubscriptions: newActivations,
    renewals,
    upgrades,
    churned: churnEvents,
    growthRatePercent: growthRate,
    churnRatePercent: churnRate,
  };
}

async function listSubscriptionUsers({ tab = 'active', limit = 100 } = {}) {
  const cap = Math.min(200, Math.max(1, Number(limit) || 100));
  const now = new Date();
  const week = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  let filter = {};
  if (tab === 'active') {
    filter = {
      subscriptionPlan: { $nin: ['', 'free'] },
      subscriptionPaidThrough: { $gt: now },
    };
  } else if (tab === 'expiring') {
    filter = {
      subscriptionPlan: { $nin: ['', 'free'] },
      subscriptionPaidThrough: { $gt: now, $lte: week },
    };
  } else if (tab === 'lapsed') {
    filter = {
      subscriptionPlan: { $nin: ['', 'free'] },
      $or: [{ subscriptionPaidThrough: { $lte: now } }, { subscriptionPaidThrough: null }],
    };
  } else if (tab === 'scheduled') {
    filter = { scheduledPlanSlug: { $ne: null } };
  }

  const users = await User.find(filter)
    .select(
      'email name subscriptionPlan subscriptionPaidThrough subscriptionBillingInterval cancelAtPeriodEnd scheduledPlanSlug scheduledChangeAt',
    )
    .sort({ subscriptionPaidThrough: 1 })
    .limit(cap)
    .lean();

  return {
    tab,
    users: users.map((u) => ({
      id: u._id.toString(),
      email: u.email,
      name: u.name || '',
      plan: u.subscriptionPlan,
      billingInterval: u.subscriptionBillingInterval,
      paidThrough: u.subscriptionPaidThrough ? new Date(u.subscriptionPaidThrough).toISOString() : null,
      cancelAtPeriodEnd: !!u.cancelAtPeriodEnd,
      scheduledPlanSlug: u.scheduledPlanSlug || null,
      scheduledChangeAt: u.scheduledChangeAt
        ? new Date(u.scheduledChangeAt).toISOString()
        : null,
      mrrUsd: monthlyValueUsd(u.subscriptionPlan, u.subscriptionBillingInterval),
    })),
  };
}

async function writeDailySnapshot() {
  const today = dateKey(new Date());
  const metrics = await subscriptionMetricsForRange(30);

  await SubscriptionSnapshot.findOneAndUpdate(
    { date: today },
    {
      $set: {
        activeCount: metrics.activeSubscriptions,
        freeCount: metrics.freeUsers,
        lapsedCount: metrics.lapsedUsers,
        mrrUsd: metrics.mrrUsd,
        newPaid: metrics.newSubscriptions,
        churned: metrics.churned,
        upgrades: metrics.upgrades,
      },
    },
    { upsert: true, new: true },
  );

  return { date: today, ...metrics };
}

async function snapshotSeries(rangeDays = 30) {
  const range = Math.min(90, Math.max(1, Number(rangeDays) || 30));
  const since = daysAgo(range);
  const sinceKey = dateKey(since);

  const rows = await SubscriptionSnapshot.find({ date: { $gte: sinceKey } })
    .sort({ date: 1 })
    .lean();

  return {
    rangeDays: range,
    series: rows.map((r) => ({
      date: r.date,
      active: r.activeCount,
      mrrUsd: r.mrrUsd,
      churned: r.churned,
      newPaid: r.newPaid,
    })),
  };
}

module.exports = {
  countActiveSubscriptions,
  subscriptionMetricsForRange,
  listSubscriptionUsers,
  writeDailySnapshot,
  snapshotSeries,
  estimateMrrUsd,
};
