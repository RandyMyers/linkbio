const config = require('../config');

/** Browser origins allowed for CORS and payment return URLs. */
const ALLOWED_CLIENT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://courageous-cocada-20fd5a.netlify.app',
  config.clientOrigin,
  config.appPublicUrl,
]
  .map((o) => String(o || '').replace(/\/$/, ''))
  .filter(Boolean);

function normalizeOrigin(value) {
  return String(value || '').replace(/\/$/, '');
}

function isAllowedClientOrigin(origin) {
  const normalized = normalizeOrigin(origin);
  return Boolean(normalized && ALLOWED_CLIENT_ORIGINS.includes(normalized));
}

/** Prefer request Origin header, then explicit body field, then configured default. */
function resolveClientOrigin(req) {
  const fromHeader = normalizeOrigin(req?.headers?.origin);
  if (isAllowedClientOrigin(fromHeader)) return fromHeader;

  const fromBody = normalizeOrigin(req?.body?.returnOrigin || req?.body?.clientOrigin);
  if (isAllowedClientOrigin(fromBody)) return fromBody;

  return normalizeOrigin(config.clientOrigin) || 'http://localhost:3000';
}

module.exports = {
  ALLOWED_CLIENT_ORIGINS,
  isAllowedClientOrigin,
  normalizeOrigin,
  resolveClientOrigin,
};
