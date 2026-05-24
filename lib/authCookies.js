const config = require('../config');

const COOKIE_NAME = 'token';

function authCookieOptions() {
  const secure = config.nodeEnv === 'production';
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? 'none' : 'lax',
    maxAge: 14 * 24 * 60 * 60 * 1000,
    path: '/',
  };
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, authCookieOptions());
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/', httpOnly: true });
}

module.exports = { COOKIE_NAME, setAuthCookie, clearAuthCookie, authCookieOptions };
