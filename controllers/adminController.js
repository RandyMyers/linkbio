const User = require('../models/User');
const BioProfile = require('../models/BioProfile');
const { overviewForRange } = require('../services/adminAnalyticsRollup');
const { countActiveSubscriptions } = require('../services/subscriptionAnalytics');
const { asyncHandler } = require('../middleware/errorHandler');

exports.me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId).select('email name role').lean();
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  res.json({
    user: {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
});

exports.overview = asyncHandler(async (req, res) => {
  const range = Math.min(90, Math.max(1, Number(req.query.range) || 30));
  const data = await overviewForRange(range);
  res.json(data);
});

exports.stats = asyncHandler(async (_req, res) => {
  const [users, profiles, paid] = await Promise.all([
    User.countDocuments(),
    BioProfile.countDocuments(),
    countActiveSubscriptions(),
  ]);
  res.json({ users, profiles, paidSubscriptions: paid });
});

