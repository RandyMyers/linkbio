const User = require('../models/User');
const { summaryForProfile, clicksForProfile, summaryToCsv } = require('../services/analyticsRollup');
const { summaryForUsername } = require('../services/commerceRollup');
const { entitlementLimits } = require('../lib/entitlements');
const { asyncHandler } = require('../middleware/errorHandler');

async function loadProfileContext(req) {
  const profile = req.profile;
  const user = await User.findById(req.userId).lean();
  const { limits } = user ? await entitlementLimits(user) : { limits: { advancedAnalytics: true } };
  return { profile, limits };
}

exports.summary = asyncHandler(async (req, res) => {
  const ctx = await loadProfileContext(req);
  const range = Math.min(90, Math.max(1, Number(req.query.range) || 7));
  const data = await summaryForProfile(ctx.profile._id, range);

  if (!ctx.limits.advancedAnalytics) {
    res.json({
      ...data,
      revenue: 0,
      topCountries: [],
      referrers: [],
      weeklyViews: data.weeklyViews || [],
      advancedLocked: true,
      profileId: ctx.profile._id.toString(),
      username: ctx.profile.username,
    });
    return;
  }

  const commerce = await summaryForUsername(ctx.profile.username, range);
  res.json({
    ...data,
    revenue: commerce.revenue,
    commerceOrders: commerce.orderCount,
    advancedLocked: false,
    profileId: ctx.profile._id.toString(),
    username: ctx.profile.username,
  });
});

exports.clicks = asyncHandler(async (req, res) => {
  const ctx = await loadProfileContext(req);
  const range = Math.min(90, Math.max(1, Number(req.query.range) || 7));
  const data = await clicksForProfile(ctx.profile._id, range);
  res.json({ ...data, profileId: ctx.profile._id.toString(), username: ctx.profile.username });
});

exports.exportCsv = asyncHandler(async (req, res) => {
  const ctx = await loadProfileContext(req);
  const range = Math.min(90, Math.max(1, Number(req.query.range) || 30));
  const data = await summaryForProfile(ctx.profile._id, range);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="analytics.csv"');
  res.send(summaryToCsv(data));
});
