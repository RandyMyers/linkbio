const mongoose = require('mongoose');
const User = require('../models/User');
const BioProfile = require('../models/BioProfile');
const SubscriptionEvent = require('../models/SubscriptionEvent');
const { normalizeInterval } = require('../lib/billingIntervals');
const { recordSubscriptionEvent } = require('../lib/subscriptionLifecycle');
const { asyncHandler } = require('../middleware/errorHandler');

function serializeUserRow(u, profileCount = 0) {
  return {
    id: u._id.toString(),
    email: u.email,
    name: u.name || '',
    role: u.role || 'creator',
    subscriptionPlan: u.subscriptionPlan || 'free',
    subscriptionStatus: u.subscriptionStatus || 'none',
    subscriptionPaidThrough: u.subscriptionPaidThrough
      ? new Date(u.subscriptionPaidThrough).toISOString()
      : null,
    subscriptionBillingInterval: u.subscriptionBillingInterval || null,
    cancelAtPeriodEnd: !!u.cancelAtPeriodEnd,
    subscriptionPeriodStart: u.subscriptionPeriodStart
      ? new Date(u.subscriptionPeriodStart).toISOString()
      : null,
    scheduledPlanSlug: u.scheduledPlanSlug || null,
    scheduledChangeAt: u.scheduledChangeAt
      ? new Date(u.scheduledChangeAt).toISOString()
      : null,
    accountCredit: {
      usd: Number(u.accountCredit?.usd) || 0,
      eur: Number(u.accountCredit?.eur) || 0,
      gbp: Number(u.accountCredit?.gbp) || 0,
    },
    profileCount: Number(profileCount) || 0,
    createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : null,
  };
}

function serializeProfileRow(p, userEmail = '') {
  return {
    id: p._id.toString(),
    userId: p.userId?.toString?.() || String(p.userId),
    userEmail: userEmail || p.userEmail || '',
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

exports.listUsers = asyncHandler(async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const page = Math.max(1, Number(req.query.page) || 1);
  const skip = (page - 1) * limit;
  const q = String(req.query.q || '').trim();
  const plan = String(req.query.plan || '').toLowerCase().trim();
  const status = String(req.query.status || '').toLowerCase().trim();

  const filter = {};
  if (q) {
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ email: re }, { name: re }];
  }
  if (plan) filter.subscriptionPlan = plan;
  if (status) filter.subscriptionStatus = status;

  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    User.countDocuments(filter),
  ]);

  const userIds = users.map((u) => u._id);
  const counts = userIds.length
    ? await BioProfile.aggregate([
        { $match: { userId: { $in: userIds } } },
        { $group: { _id: '$userId', count: { $sum: 1 } } },
      ])
    : [];
  const countMap = Object.fromEntries(counts.map((c) => [c._id.toString(), c.count]));

  res.json({
    users: users.map((u) => serializeUserRow(u, countMap[u._id.toString()] || 0)),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  });
});

exports.getUser = asyncHandler(async (req, res) => {
  let userOid;
  try {
    userOid = new mongoose.Types.ObjectId(req.params.id);
  } catch {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const user = await User.findById(userOid).lean();
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const profiles = await BioProfile.find({ userId: userOid })
    .sort({ isDefault: -1, createdAt: 1 })
    .select('username label name verified suspended suspendedReason published publishedAt updatedAt')
    .lean();

  const events = await SubscriptionEvent.find({ userId: userOid })
    .sort({ createdAt: -1 })
    .limit(30)
    .lean();

  res.json({
    user: serializeUserRow(user, profiles.length),
    profiles: profiles.map((p) => serializeProfileRow(p, user.email)),
    subscriptionEvents: events.map((e) => ({
      id: e._id.toString(),
      type: e.type,
      fromPlan: e.fromPlan,
      toPlan: e.toPlan,
      billingInterval: e.billingInterval,
      amountCharged: e.amountCharged,
      creditApplied: e.creditApplied,
      paidThroughAfter: e.paidThroughAfter
        ? new Date(e.paidThroughAfter).toISOString()
        : null,
      createdAt: e.createdAt ? new Date(e.createdAt).toISOString() : null,
      metadata: e.metadata || {},
    })),
  });
});

exports.patchUser = asyncHandler(async (req, res) => {
  let userOid;
  try {
    userOid = new mongoose.Types.ObjectId(req.params.id);
  } catch {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const user = await User.findById(userOid);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const body = req.body || {};
  const before = {
    plan: user.subscriptionPlan,
    status: user.subscriptionStatus,
    paidThrough: user.subscriptionPaidThrough,
  };

  if (body.name !== undefined) user.name = String(body.name).trim().slice(0, 120);
  if (body.role !== undefined) {
    const role = String(body.role).toLowerCase();
    if (role === 'creator' || role === 'admin') user.role = role;
  }
  if (body.subscriptionPlan !== undefined) {
    user.subscriptionPlan = String(body.subscriptionPlan).toLowerCase().trim();
  }
  if (body.subscriptionStatus !== undefined) {
    user.subscriptionStatus = String(body.subscriptionStatus).toLowerCase().trim();
  }
  if (body.subscriptionBillingInterval !== undefined) {
    user.subscriptionBillingInterval = normalizeInterval(body.subscriptionBillingInterval);
  }
  if (body.cancelAtPeriodEnd !== undefined) {
    user.cancelAtPeriodEnd = !!body.cancelAtPeriodEnd;
  }
  if (body.subscriptionPaidThrough !== undefined) {
    if (body.subscriptionPaidThrough === null || body.subscriptionPaidThrough === '') {
      user.subscriptionPaidThrough = null;
    } else {
      const d = new Date(body.subscriptionPaidThrough);
      if (Number.isNaN(d.getTime())) {
        res.status(400).json({ error: 'Invalid subscriptionPaidThrough date' });
        return;
      }
      user.subscriptionPaidThrough = d;
    }
  }
  if (body.scheduledPlanSlug !== undefined) {
    const v = String(body.scheduledPlanSlug || '').toLowerCase().trim();
    user.scheduledPlanSlug = v || null;
  }
  if (body.scheduledChangeAt !== undefined) {
    if (!body.scheduledChangeAt) {
      user.scheduledChangeAt = null;
    } else {
      const d = new Date(body.scheduledChangeAt);
      if (Number.isNaN(d.getTime())) {
        res.status(400).json({ error: 'Invalid scheduledChangeAt date' });
        return;
      }
      user.scheduledChangeAt = d;
    }
  }
  if (body.clearScheduledChange) {
    user.scheduledPlanSlug = null;
    user.scheduledChangeAt = null;
  }
  if (body.accountCredit !== undefined && body.accountCredit !== null) {
    const ac = body.accountCredit;
    if (!user.accountCredit) {
      user.accountCredit = { usd: 0, eur: 0, gbp: 0 };
    }
    for (const cur of ['usd', 'eur', 'gbp']) {
      if (ac[cur] !== undefined) {
        const n = Number(ac[cur]);
        user.accountCredit[cur] = Number.isFinite(n) && n >= 0 ? n : 0;
      }
    }
    user.markModified('accountCredit');
  }

  await user.save();

  const subChanged =
    before.plan !== user.subscriptionPlan ||
    before.status !== user.subscriptionStatus ||
    String(before.paidThrough || '') !== String(user.subscriptionPaidThrough || '');

  if (subChanged) {
    await recordSubscriptionEvent(user._id, {
      type: 'admin_adjusted',
      fromPlan: before.plan || 'free',
      toPlan: user.subscriptionPlan,
      billingInterval: user.subscriptionBillingInterval || '',
      paidThroughBefore: before.paidThrough,
      paidThroughAfter: user.subscriptionPaidThrough,
      metadata: { note: String(body.adminNote || '').slice(0, 500) },
    });
  }
  const profileCount = await BioProfile.countDocuments({ userId: user._id });
  res.json({ user: serializeUserRow(user.toObject(), profileCount) });
});

exports.suspendUser = asyncHandler(async (req, res) => {
  let userOid;
  try {
    userOid = new mongoose.Types.ObjectId(req.params.id);
  } catch {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const reason = String(req.body.reason || req.body.suspendedReason || 'Suspended by admin').slice(
    0,
    500,
  );

  const result = await BioProfile.updateMany(
    { userId: userOid },
    { $set: { suspended: true, suspendedReason: reason } },
  );

  res.json({ ok: true, profilesUpdated: result.modifiedCount, reason });
});

exports.unsuspendUser = asyncHandler(async (req, res) => {
  let userOid;
  try {
    userOid = new mongoose.Types.ObjectId(req.params.id);
  } catch {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const result = await BioProfile.updateMany(
    { userId: userOid },
    { $set: { suspended: false, suspendedReason: '' } },
  );

  res.json({ ok: true, profilesUpdated: result.modifiedCount });
});
