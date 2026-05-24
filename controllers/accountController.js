const User = require('../models/User');
const BioProfile = require('../models/BioProfile');
const PasswordResetToken = require('../models/PasswordResetToken');
const PaymentRequest = require('../models/PaymentRequest');
const CryptoPayment = require('../models/CryptoPayment');
const { serializeUser } = require('../lib/serializeUser');
const { validateUsernameFormat } = require('../lib/reservedUsernames');
const { resolveActiveProfile } = require('../services/profileAccess');
const { asyncHandler } = require('../middleware/errorHandler');

exports.getAccount = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const profile = await resolveActiveProfile(user._id);
  res.json({
    user: serializeUser(user, profile),
    notificationPrefs: user.notificationPrefs || {},
  });
});

exports.patchAccount = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (req.body.name !== undefined) {
    user.name = String(req.body.name).trim().slice(0, 120);
  }

  if (req.body.notificationPrefs && typeof req.body.notificationPrefs === 'object') {
    user.notificationPrefs = {
      weeklyAnalytics:
        req.body.notificationPrefs.weeklyAnalytics !== undefined
          ? !!req.body.notificationPrefs.weeklyAnalytics
          : user.notificationPrefs?.weeklyAnalytics,
      newSubscribers:
        req.body.notificationPrefs.newSubscribers !== undefined
          ? !!req.body.notificationPrefs.newSubscribers
          : user.notificationPrefs?.newSubscribers,
      productUpdates:
        req.body.notificationPrefs.productUpdates !== undefined
          ? !!req.body.notificationPrefs.productUpdates
          : user.notificationPrefs?.productUpdates,
      subscriptionBilling:
        req.body.notificationPrefs.subscriptionBilling !== undefined
          ? !!req.body.notificationPrefs.subscriptionBilling
          : user.notificationPrefs?.subscriptionBilling !== false,
    };
  }

  await user.save();

  const profile = await resolveActiveProfile(user._id);
  if (req.body.name !== undefined && profile) {
    profile.name = user.name;
    await profile.save();
  }

  if (req.body.username !== undefined && profile) {
    const check = validateUsernameFormat(req.body.username);
    if (!check.ok) {
      res.status(400).json({ error: check.reason });
      return;
    }
    const taken = await BioProfile.findOne({
      username: check.username,
      userId: { $ne: user._id },
    }).lean();
    if (taken) {
      res.status(409).json({ error: 'Username already taken.' });
      return;
    }
    profile.username = check.username;
    await profile.save();
  }

  res.json({
    user: serializeUser(user, profile),
    notificationPrefs: user.notificationPrefs,
  });
});

exports.changePassword = asyncHandler(async (req, res) => {
  const current = String(req.body.currentPassword || '');
  const next = String(req.body.newPassword || '');
  if (!current || next.length < 6) {
    res.status(400).json({ error: 'Current password and new password (6+ chars) required.' });
    return;
  }

  const user = await User.findById(req.userId);
  if (!user || !(await user.comparePassword(current))) {
    res.status(401).json({ error: 'Current password is incorrect.' });
    return;
  }

  user.passwordHash = await User.hashPassword(next);
  await user.save();
  res.json({ ok: true });
});

exports.deleteAccount = asyncHandler(async (req, res) => {
  const password = String(req.body.password || '');
  const user = await User.findById(req.userId);
  if (!user || !(await user.comparePassword(password))) {
    res.status(401).json({ error: 'Password required to delete account.' });
    return;
  }

  await Promise.all([
    BioProfile.deleteMany({ userId: user._id }),
    PaymentRequest.deleteMany({ userId: user._id }),
    CryptoPayment.deleteMany({ userId: user._id }),
    PasswordResetToken.deleteMany({ userId: user._id }),
  ]);
  await User.deleteOne({ _id: user._id });
  res.json({ ok: true });
});

exports.requestPasswordReset = asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = email ? await User.findOne({ email }) : null;

  if (user) {
    const raw = PasswordResetToken.generateRawToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await PasswordResetToken.create({
      userId: user._id,
      tokenHash: PasswordResetToken.hashToken(raw),
      expiresAt,
    });
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.log(`[linkbio] Password reset token for ${email}: ${raw}`);
    }
  }

  res.status(202).json({ message: 'If that email exists, reset instructions were sent.' });
});

exports.resetPassword = asyncHandler(async (req, res) => {
  const token = String(req.body.token || '').trim();
  const password = String(req.body.password || '');
  if (!token || password.length < 6) {
    res.status(400).json({ error: 'Token and new password (6+ chars) required.' });
    return;
  }

  const row = await PasswordResetToken.findOne({
    tokenHash: PasswordResetToken.hashToken(token),
    usedAt: null,
    expiresAt: { $gt: new Date() },
  });

  if (!row) {
    res.status(400).json({ error: 'Invalid or expired reset token.' });
    return;
  }

  const user = await User.findById(row.userId);
  if (!user) {
    res.status(400).json({ error: 'Invalid or expired reset token.' });
    return;
  }

  user.passwordHash = await User.hashPassword(password);
  await user.save();
  row.usedAt = new Date();
  await row.save();

  res.json({ ok: true });
});
