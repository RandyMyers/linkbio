/**
 * Profile templates derived from link-hub-plan-main visual designs.
 * Applied via POST /api/profiles/:id/apply-template
 */

const TEMPLATES = {
  onyx: {
    id: 'onyx',
    name: 'Onyx',
    category: 'Minimal',
    description: 'Dark minimal — bold type, high contrast links.',
    colors: {
      background: '#0f0f10',
      foreground: '#ffffff',
      accent: '#ffd166',
      card: '#2a2a2d',
      muted: '#6b7280',
    },
    buttonStyle: 'rounded',
    fontFamily: 'inter',
    linkLayout: 'list',
    hideWatermark: false,
    productLayout: 'grid',
    blocks: [
      { type: 'header', title: 'Featured', active: true },
      { type: 'link', title: 'Portfolio', url: 'https://example.com', active: true },
      { type: 'link', title: 'Shop', url: 'https://example.com', active: true },
      { type: 'link', title: 'Contact', url: 'mailto:hello@example.com', active: true },
      { type: 'divider', active: true },
    ],
    seo: {
      title: 'Onyx — Minimal Portfolio',
      description: 'Dark minimal link in bio. Bold typography and high-contrast links.',
    },
  },
  citrus: {
    id: 'citrus',
    name: 'Citrus',
    category: 'Creators',
    description: 'Warm creator palette — playful links and socials.',
    colors: {
      background: '#fff8f0',
      foreground: '#1b1b1b',
      accent: '#ef476f',
      card: '#fff5eb',
      muted: '#6b7280',
    },
    buttonStyle: 'rounded',
    fontFamily: 'inter',
    linkLayout: 'list',
    hideWatermark: false,
    productLayout: 'grid',
    blocks: [
      { type: 'header', title: 'Hey, I\'m Alex', active: true },
      { type: 'link', title: 'Latest video', url: 'https://youtube.com', active: true },
      { type: 'link', title: 'Instagram', url: 'https://instagram.com', active: true },
      { type: 'link', title: 'Newsletter', url: 'https://example.com', active: true },
      { type: 'link', title: 'Book a call', url: 'https://cal.com', active: true },
    ],
    seo: {
      title: 'Citrus — Creator',
      description: 'Warm palette for creators and influencers.',
    },
  },
  lagoon: {
    id: 'lagoon',
    name: 'Lagoon',
    category: 'Music',
    description: 'Cool tones — streaming and tour dates.',
    colors: {
      background: '#0a1628',
      foreground: '#e0e7ff',
      accent: '#6366f1',
      card: '#1e293b',
      muted: '#94a3b8',
    },
    buttonStyle: 'rounded',
    fontFamily: 'inter',
    linkLayout: 'list',
    hideWatermark: false,
    productLayout: 'grid',
    blocks: [
      { type: 'header', title: 'New single out now', active: true },
      { type: 'embed', title: 'Listen on Spotify', url: 'https://open.spotify.com', active: true, embedProvider: 'spotify' },
      { type: 'link', title: 'Tour dates', url: 'https://example.com', active: true },
      { type: 'link', title: 'Merch', url: 'https://example.com', active: true },
      { type: 'link', title: 'Press', url: 'mailto:press@example.com', active: true },
    ],
    seo: {
      title: 'Lagoon — Musician',
      description: 'Streaming links and tour information.',
    },
  },
  bloom: {
    id: 'bloom',
    name: 'Bloom',
    category: 'Commerce',
    description: 'Soft commerce — product-forward layout.',
    colors: {
      background: '#fffbeb',
      foreground: '#1b1b1b',
      accent: '#fb923c',
      card: '#ffffff',
      muted: '#78716c',
    },
    buttonStyle: 'rounded',
    fontFamily: 'inter',
    linkLayout: 'list',
    hideWatermark: false,
    productLayout: 'grid',
    blocks: [
      { type: 'header', title: 'Shop the collection', active: true },
      { type: 'link', title: 'Bestsellers', url: 'https://example.com', active: true },
      { type: 'link', title: 'New arrivals', url: 'https://example.com', active: true },
      { type: 'link', title: 'Size guide', url: 'https://example.com', active: true },
      { type: 'link', title: 'Contact', url: 'mailto:hello@example.com', active: true },
    ],
    seo: {
      title: 'Bloom — Shop',
      description: 'Product cards and shop links for makers and brands.',
    },
  },
  forest: {
    id: 'forest',
    name: 'Forest',
    category: 'Restaurants',
    description: 'Organic greens — menu and reservations.',
    colors: {
      background: '#f0fdf4',
      foreground: '#14532d',
      accent: '#84cc16',
      card: '#ffffff',
      muted: '#4b5563',
    },
    buttonStyle: 'rounded',
    fontFamily: 'inter',
    linkLayout: 'list',
    hideWatermark: false,
    productLayout: 'grid',
    blocks: [
      { type: 'header', title: 'Farm to table', active: true },
      { type: 'link', title: 'Menu', url: 'https://example.com', active: true },
      { type: 'link', title: 'Reservations', url: 'https://example.com', active: true },
      { type: 'link', title: 'Location', url: 'https://maps.google.com', active: true },
      { type: 'link', title: 'Instagram', url: 'https://instagram.com', active: true },
      { type: 'faq', title: 'Hours & dietary', faqItems: 'Mon–Fri 11am–9pm\nSat–Sun 10am–10pm\nVegetarian & gluten-free options available', active: true },
    ],
    seo: {
      title: 'Forest — Restaurant',
      description: 'Menu, reservations, and location for hospitality.',
    },
  },
  paper: {
    id: 'paper',
    name: 'Paper',
    category: 'Writers',
    description: 'Editorial cream — writing and newsletter.',
    colors: {
      background: '#f5f3ee',
      foreground: '#1b1b1b',
      accent: '#d6cfc2',
      card: '#ffffff',
      muted: '#6b7280',
    },
    buttonStyle: 'rounded',
    fontFamily: 'inter',
    linkLayout: 'list',
    hideWatermark: false,
    productLayout: 'grid',
    blocks: [
      { type: 'header', title: 'Essays & fiction', active: true },
      { type: 'link', title: 'Latest essay', url: 'https://example.com', active: true },
      { type: 'link', title: 'Newsletter', url: 'https://example.com', active: true },
      { type: 'link', title: 'Book club', url: 'https://example.com', active: true },
      { type: 'link', title: 'Contact', url: 'mailto:hello@example.com', active: true },
    ],
    seo: {
      title: 'Paper — Writer',
      description: 'Editorial layout for authors and newsletters.',
    },
  },
  neon: {
    id: 'neon',
    name: 'Neon',
    category: 'Music',
    description: 'Neon nightlife — events and links.',
    colors: {
      background: '#0a0a23',
      foreground: '#f5f3ff',
      accent: '#a855f7',
      card: '#1e1b4b',
      muted: '#a78bfa',
    },
    buttonStyle: 'rounded',
    fontFamily: 'inter',
    linkLayout: 'list',
    hideWatermark: false,
    productLayout: 'grid',
    blocks: [
      { type: 'header', title: 'Live this weekend', active: true },
      { type: 'link', title: 'Tickets', url: 'https://example.com', active: true },
      { type: 'link', title: 'Guest list', url: 'https://example.com', active: true },
      { type: 'link', title: 'Instagram', url: 'https://instagram.com', active: true },
      { type: 'countdown', title: 'Next event', targetDate: new Date(Date.now() + 86400000 * 7).toISOString().slice(0, 16), active: true },
    ],
    seo: {
      title: 'Neon — Events',
      description: 'Nightlife and event promotion layout.',
    },
  },
  atelier: {
    id: 'atelier',
    name: 'Atelier',
    category: 'Agencies',
    description: 'Agency slate — portfolio and contact.',
    colors: {
      background: '#f8fafc',
      foreground: '#0f172a',
      accent: '#9ca3af',
      card: '#ffffff',
      muted: '#64748b',
    },
    buttonStyle: 'rounded',
    fontFamily: 'inter',
    linkLayout: 'list',
    hideWatermark: false,
    productLayout: 'grid',
    blocks: [
      { type: 'header', title: 'Design & strategy', active: true },
      { type: 'link', title: 'Case studies', url: 'https://example.com', active: true },
      { type: 'link', title: 'Book a discovery call', url: 'https://cal.com', active: true },
      { type: 'link', title: 'Email', url: 'mailto:hello@agency.com', active: true },
    ],
    seo: {
      title: 'Atelier — Agency',
      description: 'Portfolio and contact for creative agencies.',
    },
  },
  sunset: {
    id: 'sunset',
    name: 'Sunset',
    category: 'Creators',
    description: 'Warm sunset — personal brand links.',
    colors: {
      background: '#fff7ed',
      foreground: '#1b1b1b',
      accent: '#e11d48',
      card: '#ffffff',
      muted: '#78716c',
    },
    buttonStyle: 'rounded',
    fontFamily: 'inter',
    linkLayout: 'list',
    hideWatermark: false,
    productLayout: 'grid',
    blocks: [
      { type: 'header', title: 'Hi, I\'m Sam', active: true },
      { type: 'link', title: 'YouTube', url: 'https://youtube.com', active: true },
      { type: 'link', title: 'Work with me', url: 'https://example.com', active: true },
      { type: 'link', title: 'Newsletter', url: 'https://example.com', active: true },
    ],
    seo: {
      title: 'Sunset — Personal brand',
      description: 'Warm sunset palette for coaches and creators.',
    },
  },
};

const TEMPLATE_LIST = Object.values(TEMPLATES);

function getTemplate(templateId) {
  const key = String(templateId || '').toLowerCase();
  return TEMPLATES[key] || null;
}

function blockId() {
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function blocksWithIds(blocks) {
  return blocks.map((block) => ({
    ...block,
    id: block.id || blockId(),
    title: block.title || '',
    url: block.url || '',
  }));
}

function applyTemplateToDraft(draft, templateId) {
  const t = getTemplate(templateId);
  if (!t) {
    const err = new Error(`Unknown template: ${templateId}`);
    err.statusCode = 400;
    throw err;
  }
  const st = t.colors;
  return {
    ...draft,
    template: t.id,
    buttonStyle: t.buttonStyle,
    fontFamily: t.fontFamily,
    linkLayout: t.linkLayout,
    hideWatermark: t.hideWatermark,
    productLayout: t.productLayout,
    colors: {
      background: st.background,
      text: st.foreground,
      buttonBg: st.accent,
      buttonText: st.foreground,
      accent: st.accent,
    },
    seo: { ...t.seo },
    customLinks: blocksWithIds(t.blocks),
    productCards: [],
  };
}

module.exports = {
  TEMPLATES,
  TEMPLATE_LIST,
  getTemplate,
  applyTemplateToDraft,
};
