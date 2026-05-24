function newId() {
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const { blankProfileContent } = require('./blankProfile');

function createDefaultProfileFields({ username, name, blank = false }) {
  const u = String(username || 'yourname').toLowerCase();
  const content = blank
    ? blankProfileContent()
    : {
        bio: 'Digital creator & entrepreneur ✨',
        avatar: '',
        socialLinks: [],
        customLinks: [
          { id: newId(), type: 'link', title: 'My Website', url: 'https://example.com', active: true },
          { id: newId(), type: 'link', title: 'Latest Project', url: 'https://example.com', active: true },
        ],
        productCards: [],
        template: 'minimal',
        buttonStyle: 'rounded',
        fontFamily: 'inter',
        linkLayout: 'list',
        hideWatermark: false,
        productLayout: 'grid',
        colors: {},
        seo: {},
        backgroundImage: '',
        pageBadge: '',
        eyebrowLabel: '',
        shopSectionTitle: '',
        shopSectionEyebrow: '',
      };

  return {
    username: u,
    name: name || 'Your Name',
    verified: false,
    pronouns: '',
    location: '',
    ...content,
    pixels: {},
    customDomain: '',
    published: null,
    publishedAt: null,
  };
}

module.exports = { createDefaultProfileFields, newId };
