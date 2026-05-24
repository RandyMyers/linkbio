const mongoose = require('mongoose');
const BioProfile = require('../models/BioProfile');
const User = require('../models/User');
const { createDefaultProfileFields } = require('../lib/defaultProfile');
const { validateUsernameFormat } = require('../lib/reservedUsernames');
const { entitlementLimits } = require('../lib/entitlements');

const PROFILE_HEADER = 'x-linkbio-profile-id';

function serializeProfileSummary(doc) {
  return {
    id: doc._id.toString(),
    username: doc.username,
    label: doc.label || doc.name || doc.username,
    isDefault: !!doc.isDefault,
    published: Boolean(doc.published),
    publishedAt: doc.publishedAt ? new Date(doc.publishedAt).toISOString() : null,
    avatar: doc.avatar || '',
    name: doc.name || '',
  };
}

async function countProfilesForUser(userId) {
  return BioProfile.countDocuments({ userId });
}

async function listProfilesForUser(userId) {
  const rows = await BioProfile.find({ userId }).sort({ isDefault: -1, createdAt: 1 }).lean();
  return rows.map(serializeProfileSummary);
}

async function getProfileOwnedByUser(userId, profileId) {
  if (!mongoose.Types.ObjectId.isValid(profileId)) return null;
  return BioProfile.findOne({ _id: profileId, userId });
}

async function resolveActiveProfile(userId, profileIdHint) {
  const user = await User.findById(userId);
  if (!user) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    throw err;
  }

  const hint = String(profileIdHint || '').trim();
  if (hint && mongoose.Types.ObjectId.isValid(hint)) {
    const byHint = await BioProfile.findOne({ _id: hint, userId: user._id });
    if (byHint) return byHint;
  }

  if (user.activeProfileId) {
    const active = await BioProfile.findOne({ _id: user.activeProfileId, userId: user._id });
    if (active) return active;
  }

  const defaultProfile = await BioProfile.findOne({ userId: user._id, isDefault: true });
  if (defaultProfile) return defaultProfile;

  return BioProfile.findOne({ userId: user._id }).sort({ createdAt: 1 });
}

async function assertCanCreateProfile(user) {
  const { limits } = await entitlementLimits(user);
  const maxProfiles = limits.maxProfiles ?? 1;
  const used = await countProfilesForUser(user._id);
  if (used >= maxProfiles) {
    const err = new Error('Profile limit reached for your plan.');
    err.statusCode = 403;
    err.code = 'PLAN_LIMIT';
    err.limit = maxProfiles;
    err.used = used;
    throw err;
  }
  return { limits, used, maxProfiles };
}

async function setActiveProfile(userId, profileId) {
  const profile = await getProfileOwnedByUser(userId, profileId);
  if (!profile) {
    const err = new Error('Profile not found');
    err.statusCode = 404;
    throw err;
  }
  await User.updateOne({ _id: userId }, { $set: { activeProfileId: profile._id } });
  return profile;
}

async function createProfileForUser(user, { username, label, name, blank = false }) {
  await assertCanCreateProfile(user);

  const check = validateUsernameFormat(username);
  if (!check.ok) {
    const err = new Error(check.reason);
    err.statusCode = 400;
    throw err;
  }

  const taken = await BioProfile.findOne({ username: check.username }).select('_id').lean();
  if (taken) {
    const err = new Error('Username already taken.');
    err.statusCode = 409;
    throw err;
  }

  const used = await countProfilesForUser(user._id);
  const fields = createDefaultProfileFields({
    username: check.username,
    name: name || label || check.username,
    blank,
  });

  const profile = await BioProfile.create({
    userId: user._id,
    ...fields,
    label: String(label || fields.name || check.username).trim().slice(0, 80),
    isDefault: used === 0,
  });

  await User.updateOne({ _id: user._id }, { $set: { activeProfileId: profile._id } });
  return profile;
}

async function deleteProfileForUser(userId, profileId) {
  const profile = await getProfileOwnedByUser(userId, profileId);
  if (!profile) {
    const err = new Error('Profile not found');
    err.statusCode = 404;
    throw err;
  }

  const total = await countProfilesForUser(userId);
  if (total <= 1) {
    const err = new Error('Cannot delete your only profile.');
    err.statusCode = 400;
    throw err;
  }

  const wasDefault = profile.isDefault;
  const wasActive = String((await User.findById(userId).lean())?.activeProfileId) === profileId;

  await profile.deleteOne();

  if (wasDefault) {
    const next = await BioProfile.findOne({ userId }).sort({ createdAt: 1 });
    if (next) {
      next.isDefault = true;
      await next.save();
    }
  }

  if (wasActive) {
    const fallback = await BioProfile.findOne({ userId }).sort({ isDefault: -1, createdAt: 1 });
    await User.updateOne(
      { _id: userId },
      { $set: { activeProfileId: fallback ? fallback._id : null } },
    );
  }

  return { ok: true };
}

async function profilesPayloadForUser(user) {
  const profiles = await listProfilesForUser(user._id);
  const { limits } = await entitlementLimits(user);
  const maxProfiles = limits.maxProfiles ?? 1;
  const activeId = user.activeProfileId
    ? user.activeProfileId.toString()
    : profiles.find((p) => p.isDefault)?.id || profiles[0]?.id || null;

  return {
    profiles,
    activeProfileId: activeId,
    limits: { maxProfiles, used: profiles.length },
  };
}

module.exports = {
  PROFILE_HEADER,
  serializeProfileSummary,
  countProfilesForUser,
  listProfilesForUser,
  getProfileOwnedByUser,
  resolveActiveProfile,
  assertCanCreateProfile,
  setActiveProfile,
  createProfileForUser,
  deleteProfileForUser,
  profilesPayloadForUser,
};
