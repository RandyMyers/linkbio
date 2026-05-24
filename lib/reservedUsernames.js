const RESERVED = new Set([
  'admin',
  'api',
  'login',
  'signup',
  'register',
  'dashboard',
  'builder',
  'www',
  'app',
  'help',
  'support',
  'linkbio',
  'health',
  'static',
  'assets',
]);

function normalizeUsername(username) {
  return String(username || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '');
}

function validateUsernameFormat(username) {
  const u = normalizeUsername(username);
  if (u.length < 3 || u.length > 30) {
    return { ok: false, reason: 'Use 3–30 characters: letters, numbers, underscore.' };
  }
  if (!/^[a-z0-9_]+$/.test(u)) {
    return { ok: false, reason: 'Only lowercase letters, numbers, and underscores.' };
  }
  if (RESERVED.has(u)) {
    return { ok: false, reason: 'This username is reserved.' };
  }
  return { ok: true, username: u };
}

module.exports = { RESERVED, normalizeUsername, validateUsernameFormat };
