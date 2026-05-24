const NAME_TO_ISO639 = {
  english: 'en',
  french: 'fr',
  spanish: 'es',
  german: 'de',
  italian: 'it',
  portuguese: 'pt',
  dutch: 'nl',
};

function normalizeLanguage(raw) {
  if (raw == null || raw === '') return '';
  const s = String(raw).trim().toLowerCase();
  if (!s) return '';
  if (NAME_TO_ISO639[s]) return NAME_TO_ISO639[s];
  const base = s.split(/[-_]/)[0];
  if (/^[a-z]{2,3}$/.test(base)) return base.slice(0, 2);
  return base.slice(0, 2);
}

module.exports = { normalizeLanguage, NAME_TO_ISO639 };
