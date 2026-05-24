const { entitlementLimits } = require('../lib/entitlements');
const { FREE_TEMPLATES } = require('../config/themes');
const User = require('../models/User');

function filterVisibleBlocks(links, now = new Date()) {
  if (!Array.isArray(links)) return [];
  return links.filter((link) => {
    if (link.active === false) return false;
    if (link.scheduledStart && new Date(link.scheduledStart) > now) return false;
    if (link.scheduledEnd && new Date(link.scheduledEnd) < now) return false;
    return true;
  });
}

function applyEntitlementsToDraft(draft, limits) {
  const out = { ...draft };

  if (!limits.premiumThemes && out.template && !FREE_TEMPLATES.has(out.template)) {
    out.template = 'minimal';
  }
  if (!limits.hideWatermarkAllowed) {
    out.hideWatermark = false;
  }

  out.customLinks = filterVisibleBlocks(out.customLinks);
  return out;
}

function sanitizePublishedPixels(pixels) {
  if (!pixels || typeof pixels !== 'object') return undefined;
  const out = {
    metaPixelId: String(pixels.metaPixelId || '').trim(),
    ga4Id: String(pixels.ga4Id || '').trim(),
    tiktokPixelId: String(pixels.tiktokPixelId || '').trim(),
  };
  return Object.values(out).some(Boolean) ? out : undefined;
}

function buildPublishedSnapshot(profileDoc, limits) {
  const draft = profileDoc.toClientDraft();
  const pixels = sanitizePublishedPixels(draft.pixels);
  const entitled = applyEntitlementsToDraft(draft, limits);

  return {
    ...entitled,
    ...(pixels ? { pixels } : {}),
    published: true,
    publishedAt: new Date().toISOString(),
  };
}

async function publishProfile(profileDoc) {
  const user = await User.findById(profileDoc.userId).lean();
  const { limits } = user ? await entitlementLimits(user) : { limits: { premiumThemes: true, hideWatermarkAllowed: true } };

  const snapshot = buildPublishedSnapshot(profileDoc, limits);
  profileDoc.published = snapshot;
  profileDoc.publishedAt = new Date();
  profileDoc.draftUpdatedAt = new Date();
  await profileDoc.save();
  return snapshot;
}

module.exports = {
  buildPublishedSnapshot,
  publishProfile,
  filterVisibleBlocks,
  applyEntitlementsToDraft,
};
