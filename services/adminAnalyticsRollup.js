const Event = require('../models/Event');
const User = require('../models/User');
const BioProfile = require('../models/BioProfile');
const PaymentRequest = require('../models/PaymentRequest');
const CryptoPayment = require('../models/CryptoPayment');
const GatewayPayment = require('../models/GatewayPayment');
const { countActiveSubscriptions, subscriptionMetricsForRange } = require('./subscriptionAnalytics');

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateKey(d) {
  return d.toISOString().slice(0, 10);
}

function buildDailySeries(events, rangeDays) {
  const since = daysAgo(rangeDays);
  const map = new Map();
  for (let i = rangeDays - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    map.set(dateKey(d), { date: dateKey(d), views: 0, clicks: 0, signups: 0 });
  }

  for (const row of events) {
    const key = row._id;
    if (!map.has(key)) continue;
    const entry = map.get(key);
    if (row.type === 'view') entry.views = row.count;
    if (row.type === 'click') entry.clicks = row.count;
  }

  return [...map.values()];
}

async function overviewForRange(rangeDays = 30) {
  const range = Math.min(90, Math.max(1, Number(rangeDays) || 30));
  const since = daysAgo(range);
  const weekAgo = daysAgo(7);

  const [
    usersTotal,
    profilesTotal,
    publishedProfiles,
    suspendedProfiles,
    paidSubscriptions,
    newUsersRange,
    newUsersWeek,
    viewsRange,
    clicksRange,
    pendingBank,
    cryptoWaiting,
    gatewayPending,
    paidCryptoRange,
    eventDaily,
    signupDaily,
  ] = await Promise.all([
    User.countDocuments(),
    BioProfile.countDocuments(),
    BioProfile.countDocuments({ published: true }),
    BioProfile.countDocuments({ suspended: true }),
    countActiveSubscriptions(),
    User.countDocuments({ createdAt: { $gte: since } }),
    User.countDocuments({ createdAt: { $gte: weekAgo } }),
    Event.countDocuments({ type: 'view', createdAt: { $gte: since } }),
    Event.countDocuments({ type: 'click', createdAt: { $gte: since } }),
    PaymentRequest.countDocuments({ status: 'pending' }),
    CryptoPayment.countDocuments({
      paymentStatus: { $nin: ['finished', 'confirmed'] },
      type: 'subscription',
    }),
    GatewayPayment.countDocuments({
      paymentStatus: 'pending',
      type: 'subscription',
    }),
    CryptoPayment.countDocuments({
      paymentStatus: { $in: ['finished', 'confirmed'] },
      type: 'subscription',
      createdAt: { $gte: since },
    }),
    Event.aggregate([
      { $match: { createdAt: { $gte: since }, type: { $in: ['view', 'click'] } } },
      {
        $group: {
          _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, type: '$type' },
          count: { $sum: 1 },
        },
      },
    ]),
    User.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const eventRows = eventDaily.map((r) => ({
    _id: r._id.day,
    type: r._id.type,
    count: r.count,
  }));

  const daily = buildDailySeries(eventRows, range);
  for (const row of signupDaily) {
    const day = daily.find((d) => d.date === row._id);
    if (day) day.signups = row.count;
  }

  let subscriptionMetrics = null;
  try {
    subscriptionMetrics = await subscriptionMetricsForRange(range);
  } catch {
    subscriptionMetrics = null;
  }

  return {
    rangeDays: range,
    users: {
      total: usersTotal,
      new: newUsersRange,
      newThisWeek: newUsersWeek,
      paid: paidSubscriptions,
    },
    subscriptions: subscriptionMetrics,
    profiles: {
      total: profilesTotal,
      published: publishedProfiles,
      suspended: suspendedProfiles,
    },
    events: {
      views: viewsRange,
      clicks: clicksRange,
      ctr: viewsRange > 0 ? Number(((clicksRange / viewsRange) * 100).toFixed(1)) : 0,
    },
    billing: {
      pendingBankRequests: pendingBank,
      cryptoWaiting,
      gatewayPending,
      paidCryptoSubscriptionsInRange: paidCryptoRange,
    },
    series: {
      daily,
      views: daily.map((d) => ({ date: d.date, value: d.views })),
      clicks: daily.map((d) => ({ date: d.date, value: d.clicks })),
      signups: daily.map((d) => ({ date: d.date, value: d.signups })),
    },
  };
}

function parseRangeDays(rangeDays) {
  return Math.min(90, Math.max(1, Number(rangeDays) || 30));
}

async function timeseriesForMetric(metric, rangeDays = 30) {
  const range = parseRangeDays(rangeDays);
  const since = daysAgo(range);
  const allowed = new Set(['views', 'clicks', 'signups']);
  const m = allowed.has(metric) ? metric : 'views';

  if (m === 'signups') {
    const rows = await User.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    const map = new Map();
    for (let i = range - 1; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      map.set(dateKey(d), 0);
    }
    for (const row of rows) map.set(row._id, row.count);
    return {
      metric: m,
      rangeDays: range,
      series: [...map.entries()].map(([date, value]) => ({ date, value })),
    };
  }

  const eventType = m === 'clicks' ? 'click' : 'view';
  const rows = await Event.aggregate([
    { $match: { type: eventType, createdAt: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  const map = new Map();
  for (let i = range - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    map.set(dateKey(d), 0);
  }
  for (const row of rows) map.set(row._id, row.count);
  return {
    metric: m,
    rangeDays: range,
    series: [...map.entries()].map(([date, value]) => ({ date, value })),
  };
}

async function plansDistribution() {
  const rows = await User.aggregate([
    {
      $group: {
        _id: '$subscriptionPlan',
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
  ]);
  return {
    distribution: rows.map((r) => ({
      plan: r._id || 'free',
      count: r.count,
    })),
  };
}

function normalizeReferrer(ref) {
  const s = String(ref || '').trim();
  if (!s) return 'Direct / none';
  try {
    const u = new URL(s.startsWith('http') ? s : `https://${s}`);
    return u.hostname.replace(/^www\./, '') || 'Direct / none';
  } catch {
    return s.slice(0, 80);
  }
}

async function geoBreakdown(rangeDays = 30, limit = 10) {
  const range = parseRangeDays(rangeDays);
  const since = daysAgo(range);
  const cap = Math.min(25, Math.max(1, Number(limit) || 10));

  const rows = await Event.aggregate([
    { $match: { createdAt: { $gte: since }, type: 'view' } },
    {
      $group: {
        _id: {
          $cond: [
            { $or: [{ $eq: ['$country', ''] }, { $not: ['$country'] }] },
            'Unknown',
            '$country',
          ],
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
    { $limit: cap },
  ]);

  return {
    rangeDays: range,
    geo: rows.map((r) => ({ country: r._id, count: r.count })),
  };
}

async function referrersBreakdown(rangeDays = 30, limit = 10) {
  const range = parseRangeDays(rangeDays);
  const since = daysAgo(range);
  const cap = Math.min(25, Math.max(1, Number(limit) || 10));

  const rows = await Event.find({ createdAt: { $gte: since }, type: 'view' })
    .select('referrer')
    .lean();

  const counts = new Map();
  for (const row of rows) {
    const key = normalizeReferrer(row.referrer);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const sorted = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, cap)
    .map(([source, count]) => ({ source, count }));

  return { rangeDays: range, referrers: sorted };
}

async function revenueSummary(rangeDays = 30) {
  const range = parseRangeDays(rangeDays);
  const since = daysAgo(range);
  const paidStatuses = ['finished', 'confirmed'];

  const cryptoRows = await CryptoPayment.find({
    paymentStatus: { $in: paidStatuses },
    createdAt: { $gte: since },
  })
    .select('priceAmount priceCurrency type planSlug')
    .lean();

  let cryptoTotalUsd = 0;
  const cryptoByCurrency = {};
  for (const row of cryptoRows) {
    const cur = (row.priceCurrency || 'usd').toLowerCase();
    const amt = Number(row.priceAmount) || 0;
    cryptoByCurrency[cur] = (cryptoByCurrency[cur] || 0) + amt;
    if (cur === 'usd') cryptoTotalUsd += amt;
  }

  const approvedBank = await PaymentRequest.find({
    status: 'approved',
    decidedAt: { $gte: since },
  })
    .select('requestedPlan billingInterval currency amountDue listAmount')
    .lean();

  let bankTotalUsd = 0;
  const bankByCurrency = {};
  for (const row of approvedBank) {
    const amt = Number(row.amountDue ?? row.listAmount) || 0;
    if (!amt) continue;
    const cur = (row.currency || 'usd').toLowerCase();
    bankByCurrency[cur] = (bankByCurrency[cur] || 0) + amt;
    if (cur === 'usd') bankTotalUsd += amt;
  }

  const gatewayRows = await GatewayPayment.find({
    paymentStatus: 'successful',
    createdAt: { $gte: since },
    type: 'subscription',
  })
    .select('priceAmount priceCurrency provider')
    .lean();

  let gatewayTotalUsd = 0;
  const gatewayByCurrency = {};
  for (const row of gatewayRows) {
    const cur = (row.priceCurrency || 'usd').toLowerCase();
    const amt = Number(row.priceAmount) || 0;
    gatewayByCurrency[cur] = (gatewayByCurrency[cur] || 0) + amt;
    if (cur === 'usd') gatewayTotalUsd += amt;
  }

  return {
    rangeDays: range,
    crypto: {
      count: cryptoRows.length,
      byCurrency: cryptoByCurrency,
      totalUsdEstimate: Number(cryptoTotalUsd.toFixed(2)),
    },
    bank: {
      count: approvedBank.length,
      byCurrency: bankByCurrency,
      totalUsdEstimate: Number(bankTotalUsd.toFixed(2)),
    },
    gateway: {
      count: gatewayRows.length,
      byCurrency: gatewayByCurrency,
      totalUsdEstimate: Number(gatewayTotalUsd.toFixed(2)),
    },
    combinedUsdEstimate: Number(
      (cryptoTotalUsd + bankTotalUsd + gatewayTotalUsd).toFixed(2),
    ),
  };
}

module.exports = {
  overviewForRange,
  timeseriesForMetric,
  plansDistribution,
  geoBreakdown,
  referrersBreakdown,
  revenueSummary,
};
