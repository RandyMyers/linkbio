/**
 * Pro templates (Aurora, Editorial, Storefront) — separate from hubTemplates.js
 */

const { EXTENDED_PRO_TEMPLATES } = require('./proTemplatesExtended');
const { getAssets, productsWithDemoImages } = require('./proTemplateAssets');
const IMG = require('./proTemplateAssets').PRO_TEMPLATE_ASSETS;

const PRO_TEMPLATES = {
  aurora: {
    id: 'aurora',
    name: 'Aurora',
    category: 'Pro',
    description: 'Full-bleed hero, glass links, featured drop card.',
    buttonStyle: 'rounded',
    fontFamily: 'inter',
    linkLayout: 'list',
    productLayout: 'grid',
    colors: {
      background: '#0f0f10',
      foreground: '#ffffff',
      accent: '#38bdf8',
      card: 'rgba(255,255,255,0.1)',
    },
    pageBadge: 'Pro Template · Aurora',
    eyebrowLabel: '',
    avatar: IMG.aurora.avatar,
    backgroundImage: IMG.aurora.backgroundImage,
    shopSectionTitle: '',
    shopSectionEyebrow: '',
    blocks: [
      { type: 'link', title: 'New Drop — Limited Capsule 03', subtitle: 'Shop the latest collection', url: 'https://example.com', featured: true, tag: 'NEW', active: true },
      { type: 'link', title: 'Latest YouTube Video', subtitle: 'Behind the scenes', url: 'https://youtube.com', active: true },
      { type: 'link', title: 'Listen on Spotify', subtitle: 'Monthly playlist', url: 'https://open.spotify.com', active: true },
      { type: 'link', title: 'Instagram', subtitle: '@yourname', url: 'https://instagram.com', active: true },
      { type: 'link', title: 'Book a 1:1 Session', subtitle: 'Mentorship & consulting', url: 'mailto:hello@example.com', active: true },
    ],
    productCards: [],
    seo: { title: 'Aurora — Creator link in bio', description: 'Designer, music maker & founder.' },
  },
  editorial: {
    id: 'editorial',
    name: 'Editorial',
    category: 'Pro',
    description: 'Dark editorial serif, gold accents, SEO accordion.',
    buttonStyle: 'square',
    fontFamily: 'display',
    linkLayout: 'list',
    productLayout: 'grid',
    colors: {
      background: '#0d0d0f',
      foreground: '#ece9e2',
      accent: '#c9a84c',
      card: 'transparent',
    },
    pageBadge: 'Editorial · Pro',
    eyebrowLabel: 'Author · Speaker',
    avatar: IMG.editorial.avatar,
    shopSectionTitle: '',
    shopSectionEyebrow: '',
    blocks: [
      { type: 'link', title: 'Read the new book', subtitle: 'Out now from Harbor Press', url: 'https://example.com', featured: true, active: true },
      { type: 'link', title: 'Podcast', subtitle: 'Weekly, wherever you listen', url: 'https://example.com', active: true },
      { type: 'link', title: 'Essays & research', subtitle: 'yourname.com/writing', url: 'https://example.com', active: true },
      { type: 'link', title: 'Book a keynote', subtitle: 'speaking@example.com', url: 'mailto:hello@example.com', active: true },
      {
        type: 'accordion',
        title: 'Frequently asked',
        accordionStyle: 'editorial',
        accordionItems: 'Who are you? | Brief bio and expertise.\nWhat do you offer? | Books, cohorts, speaking.\nHow do I book you? | Use the booking link above.',
        active: true,
      },
    ],
    productCards: [],
    seo: { title: 'Editorial — Professional profile', description: 'Books, talks, essays and consulting.' },
  },
  storefront: {
    id: 'storefront',
    name: 'Storefront',
    category: 'Pro',
    description: 'Product grid with vendor, badges, and shop CTA.',
    buttonStyle: 'square',
    fontFamily: 'display',
    linkLayout: 'list',
    productLayout: 'grid',
    colors: {
      background: '#f6f3ee',
      foreground: '#1a1a1a',
      accent: '#1a1a1a',
      card: '#ffffff',
    },
    pageBadge: 'Shop · Edit',
    eyebrowLabel: '',
    avatar: IMG.storefront.avatar,
    shopSectionTitle: 'Currently loving',
    shopSectionEyebrow: 'The Shop',
    blocks: [
      { type: 'link', title: 'Visit the full storefront', subtitle: 'yourshop.com', url: 'https://example.com', featured: true, active: true },
    ],
    productCards: [
      { title: 'Cloud Runner 02', vendor: 'Maison Lumen', price: '$148', oldPrice: '$180', badge: 'Bestseller', image: IMG.storefront.productImages[0], url: 'https://example.com' },
      { title: 'Golden Hour Serum', vendor: 'Lumen Skin', price: '$62', badge: 'New', image: IMG.storefront.productImages[1], url: 'https://example.com' },
      { title: 'Stoneware Mug', vendor: 'Studio Kiln', price: '$38', image: IMG.storefront.productImages[2], url: 'https://example.com' },
      { title: 'Heritage Leather Tote', vendor: 'North & Pine', price: '$295', image: IMG.storefront.productImages[3], url: 'https://example.com' },
    ],
    seo: { title: 'Storefront — Shop link in bio', description: 'Hand-picked products with prices and vendors.' },
  },
  ...EXTENDED_PRO_TEMPLATES,
};

const PRO_TEMPLATE_LIST = Object.values(PRO_TEMPLATES);

function blockId() {
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function blocksWithIds(blocks) {
  return blocks.map((b) => ({
    ...b,
    id: b.id || blockId(),
    title: b.title || '',
    url: b.url || '',
  }));
}

function productsWithIds(cards) {
  return (cards || []).map((c) => ({
    ...c,
    id: c.id || blockId(),
    title: c.title || 'Product',
    price: c.price || '',
    vendor: c.vendor || '',
    oldPrice: c.oldPrice || '',
    badge: c.badge || '',
    tagline: c.tagline || '',
    description: c.description || '',
    image: c.image || '',
    url: c.url || '',
  }));
}

function getProTemplate(templateId) {
  return PRO_TEMPLATES[String(templateId || '').toLowerCase()] || null;
}

function applyProTemplateToDraft(draft, templateId) {
  const t = getProTemplate(templateId);
  if (!t) return null;
  const st = t.colors;
  const assets = getAssets(t.id);
  return {
    ...draft,
    template: t.id,
    buttonStyle: t.buttonStyle,
    fontFamily: t.fontFamily,
    linkLayout: t.linkLayout,
    productLayout: t.productLayout,
    avatar: assets?.avatar || t.avatar || draft.avatar || '',
    backgroundImage: assets?.backgroundImage || t.backgroundImage || draft.backgroundImage || '',
    pageBadge: t.pageBadge || '',
    eyebrowLabel: t.eyebrowLabel || '',
    shopSectionTitle: t.shopSectionTitle || '',
    shopSectionEyebrow: t.shopSectionEyebrow || '',
    pullQuote: '',
    pressLine: '',
    heroCaption: '',
    highlightStats: [],
    ritualSteps: [],
    bio: t.bio !== undefined ? t.bio : draft.bio,
    colors: {
      background: st.background,
      text: st.foreground,
      buttonBg: st.accent,
      buttonText: st.foreground,
      accent: st.accent,
    },
    seo: { ...t.seo },
    customLinks: blocksWithIds(t.blocks),
    productCards: productsWithIds(productsWithDemoImages(t.productCards, t.id)),
  };
}

module.exports = {
  PRO_TEMPLATES,
  PRO_TEMPLATE_LIST,
  getProTemplate,
  applyProTemplateToDraft,
};
