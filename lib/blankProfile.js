/** Fields for an empty canvas (minimal theme, no starter blocks). */
function blankProfileContent() {
  return {
    bio: '',
    avatar: '',
    socialLinks: [],
    customLinks: [],
    productCards: [],
    template: 'minimal',
    buttonStyle: 'rounded',
    fontFamily: 'inter',
    linkLayout: 'list',
    productLayout: 'grid',
    hideWatermark: false,
    colors: {},
    seo: {},
    backgroundImage: '',
    pageBadge: '',
    eyebrowLabel: '',
    shopSectionTitle: '',
    shopSectionEyebrow: '',
  };
}

/** Reset draft content while keeping identity (username, name, id). */
function applyBlankToDraft(base) {
  const blank = blankProfileContent();
  return {
    ...base,
    ...blank,
    username: base.username,
    name: base.name,
    verified: base.verified,
    pronouns: base.pronouns || '',
    location: base.location || '',
    label: base.label,
    id: base.id,
    customDomain: base.customDomain || '',
    pixels: base.pixels || {},
  };
}

module.exports = { blankProfileContent, applyBlankToDraft };
