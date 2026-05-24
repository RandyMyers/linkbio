const { buildLogoUrl } = require('./logoDev');

/** Canonical social platforms — logoDomain powers Logo.dev lookups. */
const SOCIAL_PLATFORM_CATALOG = [
  { key: 'instagram', label: 'Instagram', emoji: '📷', logoDomain: 'instagram.com', placeholder: 'https://instagram.com/username', sortOrder: 0 },
  { key: 'twitter', label: 'X / Twitter', emoji: '𝕏', logoDomain: 'x.com', placeholder: 'https://x.com/username', sortOrder: 1 },
  { key: 'tiktok', label: 'TikTok', emoji: '🎵', logoDomain: 'tiktok.com', placeholder: 'https://tiktok.com/@username', sortOrder: 2 },
  { key: 'youtube', label: 'YouTube', emoji: '▶', logoDomain: 'youtube.com', placeholder: 'https://youtube.com/@channel', sortOrder: 3 },
  { key: 'facebook', label: 'Facebook', emoji: 'f', logoDomain: 'facebook.com', placeholder: 'https://facebook.com/page', sortOrder: 4 },
  { key: 'linkedin', label: 'LinkedIn', emoji: 'in', logoDomain: 'linkedin.com', placeholder: 'https://linkedin.com/in/username', sortOrder: 5 },
  { key: 'github', label: 'GitHub', emoji: '⌘', logoDomain: 'github.com', placeholder: 'https://github.com/username', sortOrder: 6 },
  { key: 'spotify', label: 'Spotify', emoji: '♫', logoDomain: 'spotify.com', placeholder: 'https://open.spotify.com/artist/...', sortOrder: 7 },
  { key: 'pinterest', label: 'Pinterest', emoji: 'P', logoDomain: 'pinterest.com', placeholder: 'https://pinterest.com/username', sortOrder: 8 },
  { key: 'snapchat', label: 'Snapchat', emoji: '👻', logoDomain: 'snapchat.com', placeholder: 'https://snapchat.com/add/username', sortOrder: 9 },
  { key: 'whatsapp', label: 'WhatsApp', emoji: '💬', logoDomain: 'whatsapp.com', placeholder: 'https://wa.me/number', sortOrder: 10 },
  { key: 'email', label: 'Email', emoji: '✉', logoDomain: null, placeholder: 'mailto:you@example.com', sortOrder: 11 },
];

function serializePlatform(row, options = {}) {
  const logoDomain = row.logoDomain || null;
  const size = options.logoSize || 64;
  const format = options.format || 'png';
  const theme = options.theme;

  return {
    id: row.key,
    key: row.key,
    label: row.label,
    emoji: row.emoji || '',
    placeholder: row.placeholder || '',
    logoDomain,
    logoUrl: logoDomain
      ? buildLogoUrl(logoDomain, { size, format, theme, retina: options.retina })
      : null,
    sortOrder: row.sortOrder ?? 0,
  };
}

function listPlatformsSerialized(options = {}) {
  return SOCIAL_PLATFORM_CATALOG.map((row) => serializePlatform(row, options)).sort((a, b) => a.sortOrder - b.sortOrder);
}

function getPlatformByKey(key, options = {}) {
  const row = SOCIAL_PLATFORM_CATALOG.find((p) => p.key === key);
  return row ? serializePlatform(row, options) : null;
}

module.exports = {
  SOCIAL_PLATFORM_CATALOG,
  serializePlatform,
  listPlatformsSerialized,
  getPlatformByKey,
};
