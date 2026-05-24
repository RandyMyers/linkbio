const { validateUsernameFormat } = require('../lib/reservedUsernames');
const { ALL_TEMPLATES } = require('../config/themes');

const BLOCK_TYPES = new Set([
  'link',
  'stats',
  'ritual',
  'quote',
  'caption',
  'banner',
  'tourDates',
  'platformGrid',
  'header',
  'divider',
  'embed',
  'image',
  'faq',
  'accordion',
  'countdown',
  'newsletter',
  'tip',
]);

const HTTPS_URL = /^https:\/\/.+/i;

function isSafeUrl(url) {
  if (!url || typeof url !== 'string') return true;
  const trimmed = url.trim();
  if (!trimmed) return true;
  return HTTPS_URL.test(trimmed);
}

function pickDraftFields(body) {
  const allowed = [
    'username',
    'name',
    'verified',
    'pronouns',
    'location',
    'bio',
    'avatar',
    'socialLinks',
    'customLinks',
    'productCards',
    'template',
    'buttonStyle',
    'fontFamily',
    'linkLayout',
    'productLayout',
    'hideWatermark',
    'colors',
    'seo',
    'pixels',
    'customDomain',
    'backgroundImage',
    'pageBadge',
    'eyebrowLabel',
    'shopSectionTitle',
    'shopSectionEyebrow',
    'pullQuote',
    'pressLine',
    'heroCaption',
    'highlightStats',
    'ritualSteps',
  ];
  const patch = {};
  for (const key of allowed) {
    if (body[key] !== undefined) patch[key] = body[key];
  }
  return patch;
}

function validateBlock(block, index) {
  if (!block || typeof block !== 'object') return `Block ${index + 1} is invalid.`;
  if (!block.type || !BLOCK_TYPES.has(block.type)) return `Block ${index + 1} has invalid type.`;
  if (block.type === 'link' && block.url && !isSafeUrl(block.url)) {
    return `Block ${index + 1} URL must use HTTPS.`;
  }
  if (block.type === 'embed' && block.url && !isSafeUrl(block.url)) {
    return `Block ${index + 1} embed URL must use HTTPS.`;
  }
  return null;
}

function validateSocialLinks(links) {
  if (!Array.isArray(links)) return 'socialLinks must be an array.';
  for (let i = 0; i < links.length; i += 1) {
    const row = links[i];
    if (row?.url && !isSafeUrl(row.url)) return `Social link ${i + 1} must use HTTPS.`;
  }
  return null;
}

function validateProductCards(cards) {
  if (!Array.isArray(cards)) return 'productCards must be an array.';
  if (cards.length > 24) return 'Too many products (max 24).';
  for (let i = 0; i < cards.length; i += 1) {
    const c = cards[i];
    if (c?.url && !isSafeUrl(c.url)) return `Product ${i + 1} URL must use HTTPS.`;
  }
  return null;
}

function validateDraftPatch(patch) {
  if (patch.username !== undefined) {
    const check = validateUsernameFormat(patch.username);
    if (!check.ok) return { error: check.reason };
    patch.username = check.username;
  }
  if (patch.template !== undefined && !ALL_TEMPLATES.has(patch.template)) {
    return { error: 'Invalid template id.' };
  }
  if (patch.bio !== undefined && String(patch.bio).length > 160) {
    return { error: 'Bio must be 160 characters or fewer.' };
  }
  if (patch.customLinks !== undefined) {
    if (!Array.isArray(patch.customLinks)) return { error: 'customLinks must be an array.' };
    if (patch.customLinks.length > 50) return { error: 'Too many blocks (max 50).' };
    for (let i = 0; i < patch.customLinks.length; i += 1) {
      const blockErr = validateBlock(patch.customLinks[i], i);
      if (blockErr) return { error: blockErr };
    }
  }
  if (patch.socialLinks !== undefined) {
    const socialErr = validateSocialLinks(patch.socialLinks);
    if (socialErr) return { error: socialErr };
  }
  if (patch.productCards !== undefined) {
    const productErr = validateProductCards(patch.productCards);
    if (productErr) return { error: productErr };
  }
  return { patch };
}

module.exports = {
  pickDraftFields,
  validateDraftPatch,
  ALL_TEMPLATES,
  BLOCK_TYPES,
  isSafeUrl,
};
