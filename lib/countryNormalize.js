const NAME_TO_ISO2 = {
  france: 'FR',
  'united states': 'US',
  usa: 'US',
  'united kingdom': 'GB',
  uk: 'GB',
  germany: 'DE',
  spain: 'ES',
  italy: 'IT',
  canada: 'CA',
  nigeria: 'NG',
  belgium: 'BE',
  switzerland: 'CH',
  netherlands: 'NL',
  portugal: 'PT',
  brazil: 'BR',
  mexico: 'MX',
  india: 'IN',
  australia: 'AU',
};

function normalizeCountry(raw) {
  if (raw == null || raw === '') return '';
  const s = String(raw).trim();
  if (!s) return '';
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  const key = s.toLowerCase();
  if (NAME_TO_ISO2[key]) return NAME_TO_ISO2[key];
  return s.slice(0, 2).toUpperCase();
}

module.exports = { normalizeCountry, NAME_TO_ISO2 };
