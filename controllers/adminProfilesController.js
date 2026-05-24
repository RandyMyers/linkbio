const mongoose = require('mongoose');
const User = require('../models/User');
const BioProfile = require('../models/BioProfile');
const { asyncHandler } = require('../middleware/errorHandler');

function serializeProfileRow(p) {
  return {
    id: p._id.toString(),
    userId: p.userId?.toString?.() || String(p.userId),
    userEmail: p.userEmail || '',
    username: p.username,
    label: p.label || '',
    name: p.name || '',
    verified: !!p.verified,
    suspended: !!p.suspended,
    suspendedReason: p.suspendedReason || '',
    published: Boolean(p.published),
    publishedAt: p.publishedAt ? new Date(p.publishedAt).toISOString() : null,
    updatedAt: p.updatedAt ? new Date(p.updatedAt).toISOString() : null,
  };
}

exports.listProfiles = asyncHandler(async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const page = Math.max(1, Number(req.query.page) || 1);
  const skip = (page - 1) * limit;
  const q = String(req.query.q || '').trim().toLowerCase();
  const suspended = req.query.suspended;
  const published = req.query.published;

  const filter = {};
  if (q) {
    filter.username = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }
  if (suspended === 'true') filter.suspended = true;
  if (suspended === 'false') filter.suspended = false;
  if (published === 'true') filter.published = { $ne: null };
  if (published === 'false') filter.published = null;

  const [rows, total] = await Promise.all([
    BioProfile.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
    BioProfile.countDocuments(filter),
  ]);

  const userIds = [...new Set(rows.map((p) => p.userId.toString()))];
  const users = await User.find({ _id: { $in: userIds } })
    .select('email')
    .lean();
  const emailMap = Object.fromEntries(users.map((u) => [u._id.toString(), u.email]));

  res.json({
    profiles: rows.map((p) =>
      serializeProfileRow({
        ...p,
        userEmail: emailMap[p.userId.toString()] || '',
      }),
    ),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  });
});

exports.getProfile = asyncHandler(async (req, res) => {
  const profile = await BioProfile.findById(req.params.id).lean();
  if (!profile) {
    res.status(404).json({ error: 'Profile not found' });
    return;
  }

  const user = await User.findById(profile.userId).select('email name').lean();

  res.json({
    profile: serializeProfileRow({
      ...profile,
      userEmail: user?.email || '',
    }),
    user: user
      ? { id: user._id.toString(), email: user.email, name: user.name || '' }
      : null,
  });
});

exports.patchProfile = asyncHandler(async (req, res) => {
  const profile = await BioProfile.findById(req.params.id);
  if (!profile) {
    res.status(404).json({ error: 'Profile not found' });
    return;
  }

  if (req.body.verified !== undefined) profile.verified = !!req.body.verified;
  if (req.body.suspended !== undefined) profile.suspended = !!req.body.suspended;
  if (req.body.suspendedReason !== undefined) {
    profile.suspendedReason = String(req.body.suspendedReason).slice(0, 500);
  }

  await profile.save();

  const user = await User.findById(profile.userId).select('email').lean();

  res.json({
    profile: serializeProfileRow({
      ...profile.toObject(),
      userEmail: user?.email || '',
    }),
  });
});
