const mongoose = require('mongoose');
const User = require('../models/User');
const BioProfile = require('../models/BioProfile');
const { signUserToken } = require('../lib/tokens');
const { setAuthCookie, clearAuthCookie } = require('../lib/authCookies');
const { serializeUser } = require('../lib/serializeUser');
const { createDefaultProfileFields } = require('../lib/defaultProfile');
const { validateUsernameFormat, normalizeUsername } = require('../lib/reservedUsernames');
const { profilesPayloadForUser } = require('../services/profileAccess');
const { asyncHandler } = require('../middleware/errorHandler');

exports.register = asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const name = String(req.body.name || '').trim();
  const usernameRaw = req.body.username || email.split('@')[0];

  if (!email || !password || password.length < 6) {
    res.status(400).json({ error: 'Valid email and password (6+ chars) required.' });
    return;
  }

  const usernameCheck = validateUsernameFormat(usernameRaw);
  if (!usernameCheck.ok) {
    res.status(400).json({ error: usernameCheck.reason });
    return;
  }

  const existingEmail = await User.findOne({ email }).lean();
  if (existingEmail) {
    res.status(409).json({ error: 'Email already registered.' });
    return;
  }

  const existingUsername = await BioProfile.findOne({ username: usernameCheck.username }).lean();
  if (existingUsername) {
    res.status(409).json({ error: 'Username already taken.' });
    return;
  }

  const passwordHash = await User.hashPassword(password);
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const [user] = await User.create(
      [{ email, passwordHash, name: name || usernameCheck.username }],
      { session },
    );
    const startBlank =
      req.body.startBlank === true ||
      req.body.blank === true ||
      req.body.template === 'blank';
    const fields = createDefaultProfileFields({
      username: usernameCheck.username,
      name: name || 'Your Name',
      blank: startBlank,
    });
    const [profile] = await BioProfile.create(
      [{ userId: user._id, ...fields, isDefault: true, label: name || usernameCheck.username }],
      { session },
    );
    user.activeProfileId = profile._id;
    await user.save({ session });
    await session.commitTransaction();

    const token = signUserToken(user._id.toString());
    setAuthCookie(res, token);
    const profilesPayload = await profilesPayloadForUser(user);
    res.status(201).json({
      token,
      user: serializeUser(user, profile),
      profile: profile.toClientDraft(),
      ...profilesPayload,
    });
  } catch (e) {
    await session.abortTransaction().catch(() => {});
    if (e?.code === 11000) {
      res.status(409).json({ error: 'Email or username already in use.' });
      return;
    }
    throw e;
  } finally {
    session.endSession();
  }
});

exports.login = asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password required.' });
    return;
  }

  const user = await User.findOne({ email });
  if (!user || !(await user.comparePassword(password))) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  user.lastLoginAt = new Date();
  await user.save();

  const profile = await BioProfile.findOne({ userId: user._id }).sort({ isDefault: -1, createdAt: 1 });
  const token = signUserToken(user._id.toString());
  setAuthCookie(res, token);
  res.json({
    token,
    user: serializeUser(user, profile),
    ...(await profilesPayloadForUser(user)),
  });
});

exports.logout = asyncHandler(async (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

exports.me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const profile = await BioProfile.findOne({ userId: user._id }).sort({ isDefault: -1, createdAt: 1 });
  const profilesPayload = await profilesPayloadForUser(user);
  res.json({
    user: serializeUser(user, profile),
    profile: profile ? profile.toClientDraft() : null,
    ...profilesPayload,
  });
});

