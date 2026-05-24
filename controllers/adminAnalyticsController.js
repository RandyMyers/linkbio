const {
  timeseriesForMetric,
  plansDistribution,
  geoBreakdown,
  referrersBreakdown,
  revenueSummary,
} = require('../services/adminAnalyticsRollup');
const { asyncHandler } = require('../middleware/errorHandler');

exports.timeseries = asyncHandler(async (req, res) => {
  const metric = String(req.query.metric || 'views').toLowerCase();
  const range = Number(req.query.range) || 30;
  const data = await timeseriesForMetric(metric, range);
  res.json(data);
});

exports.plansDistribution = asyncHandler(async (_req, res) => {
  const data = await plansDistribution();
  res.json(data);
});

exports.geo = asyncHandler(async (req, res) => {
  const range = Number(req.query.range) || 30;
  const limit = Number(req.query.limit) || 10;
  const data = await geoBreakdown(range, limit);
  res.json(data);
});

exports.referrers = asyncHandler(async (req, res) => {
  const range = Number(req.query.range) || 30;
  const limit = Number(req.query.limit) || 10;
  const data = await referrersBreakdown(range, limit);
  res.json(data);
});

exports.revenue = asyncHandler(async (req, res) => {
  const range = Number(req.query.range) || 30;
  const data = await revenueSummary(range);
  res.json(data);
});
