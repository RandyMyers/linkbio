const User = require('../models/User');
const { pickDraftFields, validateDraftPatch } = require('../services/profileValidation');
const { publishProfile } = require('../services/profilePublish');
const { enrichCustomLinks } = require('../services/oEmbed');
const { deliverWebhooks } = require('../services/webhookDelivery');
const { applyTemplateToDraft } = require('../lib/hubTemplates');
const { applyProTemplateToDraft, PRO_TEMPLATE_LIST } = require('../lib/proTemplates');
const { applyBlankToDraft } = require('../lib/blankProfile');
const { BLANK_TEMPLATE } = require('../lib/blankTemplateMeta');
const { entitlementLimits } = require('../lib/entitlements');
const { FREE_TEMPLATES } = require('../config/themes');
const { encryptJson } = require('../lib/secrets');
const { validateUsernameFormat } = require('../lib/reservedUsernames');
const BioProfile = require('../models/BioProfile');
const {
  listProfilesForUser,
  getProfileOwnedByUser,
  createProfileForUser,
  setActiveProfile,
  deleteProfileForUser,
  profilesPayloadForUser,
} = require('../services/profileAccess');
const { asyncHandler } = require('../middleware/errorHandler');

exports.list = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  res.json(await profilesPayloadForUser(user));
});

exports.create = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const profile = await createProfileForUser(user, {
      username: req.body.username,
      label: req.body.label,
      name: req.body.name,
      blank: req.body.blank === true || req.body.startBlank === true,
    });
    const payload = await profilesPayloadForUser(await User.findById(req.userId));
    res.status(201).json({
      profile: profile.toClientDraft(),
      ...payload,
    });
  } catch (e) {
    res.status(e.statusCode || 500).json({
      error: e.message,
      code: e.code,
      limit: e.limit,
      used: e.used,
    });
  }
});

exports.getOne = asyncHandler(async (req, res) => {
  const profile = await getProfileOwnedByUser(req.userId, req.params.id);
  if (!profile) {
    res.status(404).json({ error: 'Profile not found' });
    return;
  }
  res.json(profile.toClientDraft());
});

exports.patchOne = asyncHandler(async (req, res) => {
  const profile = await getProfileOwnedByUser(req.userId, req.params.id);
  if (!profile) {
    res.status(404).json({ error: 'Profile not found' });
    return;
  }

  const raw = pickDraftFields(req.body);
  const { error, patch } = validateDraftPatch(raw);
  if (error) {
    res.status(400).json({ error });
    return;
  }

  if (patch.label !== undefined) {
    profile.label = String(patch.label).trim().slice(0, 80);
    delete patch.label;
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

exports.publishOne = asyncHandler(async (req, res) => {
  const profile = await getProfileOwnedByUser(req.userId, req.params.id);
  if (!profile) {
    res.status(404).json({ error: 'Profile not found' });
    return;
  }

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

exports.activate = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    await setActiveProfile(req.userId, req.params.id);
    res.json(await profilesPayloadForUser(user));
  } catch (e) {
    res.status(e.statusCode || 404).json({ error: e.message });
  }
});

exports.listTemplates = asyncHandler(async (req, res) => {
  const { TEMPLATE_LIST } = require('../lib/hubTemplates');
  const hub = TEMPLATE_LIST.map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category,
    description: t.description,
    tier: 'hub',
    previewColors: t.colors,
  }));
  const pro = PRO_TEMPLATE_LIST.map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category,
    description: t.description || t.name,
    tier: 'pro',
    previewColors: t.colors,
  }));
  res.json({ templates: [BLANK_TEMPLATE, ...pro, ...hub] });
});

exports.applyTemplate = asyncHandler(async (req, res) => {
  const profile = await getProfileOwnedByUser(req.userId, req.params.id);
  if (!profile) {
    res.status(404).json({ error: 'Profile not found' });
    return;
  }
  const templateId = String(req.body.template || '').trim();
  const base = profile.toClientDraft();
  let draft;
  if (templateId === 'blank') {
    draft = applyBlankToDraft(base);
  } else {
    draft = applyProTemplateToDraft(base, templateId);
    if (!draft) {
      try {
        draft = applyTemplateToDraft(base, templateId);
      } catch (e) {
        res.status(e.statusCode || 400).json({ error: e.message });
        return;
      }
    }
  }
  Object.assign(profile, draft);
  profile.draftUpdatedAt = new Date();
  await profile.save();
  res.json(profile.toClientDraft());
});

exports.remove = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    await deleteProfileForUser(req.userId, req.params.id);
    res.json(await profilesPayloadForUser(await User.findById(req.userId)));
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

exports.limits = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const { limits } = await entitlementLimits(user);
  const maxProfiles = limits.maxProfiles ?? 1;
  const used = (await listProfilesForUser(req.userId)).length;
  res.json({
    maxProfiles,
    used,
    canCreate: used < maxProfiles,
  });
});
