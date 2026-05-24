const User = require('../models/User');
const BioProfile = require('../models/BioProfile');
const { pickDraftFields, validateDraftPatch } = require('../services/profileValidation');
const { publishProfile } = require('../services/profilePublish');
const { enrichCustomLinks } = require('../services/oEmbed');
const { deliverWebhooks } = require('../services/webhookDelivery');
const { entitlementLimits } = require('../lib/entitlements');
const { FREE_TEMPLATES } = require('../config/themes');
const { encryptJson } = require('../lib/secrets');
const { validateUsernameFormat } = require('../lib/reservedUsernames');
const { asyncHandler } = require('../middleware/errorHandler');

exports.getMine = asyncHandler(async (req, res) => {
  res.json(req.profile.toClientDraft());
});

exports.patchMine = asyncHandler(async (req, res) => {
  const profile = req.profile;
  const raw = pickDraftFields(req.body);
  const { error, patch } = validateDraftPatch(raw);
  if (error) {
    res.status(400).json({ error });
    return;
  }

  if (req.body.label !== undefined) {
    profile.label = String(req.body.label).trim().slice(0, 80);
  }

  if (patch.username && patch.username !== profile.username) {
    const check = validateUsernameFormat(patch.username);
    if (!check.ok) {
      res.status(400).json({ error: check.reason });
      return;
    }
    const taken = await BioProfile.findOne({
      username: check.username,
      _id: { $ne: profile._id },
    })
      .select('_id')
      .lean();
    if (taken) {
      res.status(409).json({ error: 'Username already taken.' });
      return;
    }
    patch.username = check.username;
  }

  if (patch.pixels !== undefined) {
    patch.pixels = encryptJson(patch.pixels);
  }
  if (patch.customLinks !== undefined) {
    patch.customLinks = await enrichCustomLinks(patch.customLinks);
  }

  const user = await User.findById(req.userId).lean();
  if (user) {
    const { limits } = await entitlementLimits(user);
    if (patch.template && !limits.premiumThemes && !FREE_TEMPLATES.has(patch.template)) {
      res.status(403).json({ error: 'Premium template requires Pro or Studio plan.', code: 'PLAN_LIMIT' });
      return;
    }
    if (patch.hideWatermark === true && !limits.hideWatermarkAllowed) {
      res.status(403).json({ error: 'Remove watermark requires Pro or Studio plan.', code: 'PLAN_LIMIT' });
      return;
    }
  }

  Object.assign(profile, patch);
  profile.draftUpdatedAt = new Date();
  await profile.save();

  res.json(profile.toClientDraft());
});

exports.publishMine = asyncHandler(async (req, res) => {
  const profile = req.profile;

  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    const raw = pickDraftFields(req.body);
    const { error, patch } = validateDraftPatch(raw);
    if (error) {
      res.status(400).json({ error });
      return;
    }
    Object.assign(profile, patch);
  }

  const snapshot = await publishProfile(profile);
  await deliverWebhooks(req.userId, 'profile.published', {
    username: profile.username,
    profileId: profile._id.toString(),
    publishedAt: snapshot.publishedAt,
  });
  res.json(snapshot);
});
