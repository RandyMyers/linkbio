const {
  subscriptionMetricsForRange,
  listSubscriptionUsers,
  snapshotSeries,
} = require('../services/subscriptionAnalytics');
const { asyncHandler } = require('../middleware/errorHandler');

exports.getMetrics = asyncHandler(async (req, res) => {
  const range = Number(req.query.range) || 30;
  const metrics = await subscriptionMetricsForRange(range);
  const snapshots = await snapshotSeries(range);
  res.json({ metrics, snapshots });
});

exports.listUsers = asyncHandler(async (req, res) => {
  const tab = String(req.query.tab || 'active').toLowerCase();
  const limit = Number(req.query.limit) || 100;
  const data = await listSubscriptionUsers({ tab, limit });
  res.json(data);
});

exports.exportCsv = asyncHandler(async (req, res) => {
  const tab = String(req.query.tab || 'active').toLowerCase();
  const { users } = await listSubscriptionUsers({ tab, limit: 500 });

  const header = 'email,name,plan,interval,paidThrough,cancelScheduled,scheduledPlan,mrrUsd';
  const lines = users.map((u) => {
    const esc = (s) => `"${String(s || '').replace(/"/g, '""')}"`;
    return [
      esc(u.email),
      esc(u.name),
      esc(u.plan),
      esc(u.billingInterval),
      esc(u.paidThrough || ''),
      u.cancelAtPeriodEnd ? 'yes' : 'no',
      esc(u.scheduledPlanSlug || ''),
      u.mrrUsd ?? 0,
    ].join(',');
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="subscriptions-${tab}.csv"`);
  res.send([header, ...lines].join('\n'));
});
