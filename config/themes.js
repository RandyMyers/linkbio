const PRO_TEMPLATE_IDS = [
  'aurora',
  'editorial',
  'storefront',
  'artist',
  'brutalist',
  'coach',
  'magazine',
  'skincare',
];

const HUB_TEMPLATE_IDS = [
  'onyx',
  'citrus',
  'lagoon',
  'bloom',
  'forest',
  'paper',
  'neon',
  'atelier',
  'sunset',
];

/** Themes available on the free plan (Pro/Studio unlock all templates). */
const FREE_TEMPLATES = new Set([
  'blank',
  'minimal',
  'ocean',
  'pastel',
  'gradient',
  'glass',
  'onyx',
  'citrus',
  'sunset',
  'paper',
  ...PRO_TEMPLATE_IDS,
]);

const ALL_TEMPLATES = new Set([
  'blank',
  'minimal',
  'gradient',
  'glass',
  'neon',
  'pastel',
  'retro',
  'luxury',
  'ocean',
  ...PRO_TEMPLATE_IDS,
  ...HUB_TEMPLATE_IDS,
]);

module.exports = { FREE_TEMPLATES, ALL_TEMPLATES };
