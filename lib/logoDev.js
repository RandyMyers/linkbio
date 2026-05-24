const config = require('../config');

const LOGO_CDN = 'https://img.logo.dev';

/**
 * Build a Logo.dev image URL (publishable key — safe for img src).
 * @see https://www.logo.dev/docs/logo-images/introduction
 */
function buildLogoUrl(domain, options = {}) {
  const token = options.token || config.logoDevToken;
  if (!domain || !token) return null;

  const host = String(domain)
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
  if (!host) return null;

  const params = new URLSearchParams();
  params.set('token', token);
  const size = Number(options.size);
  if (size > 0 && size <= 800) params.set('size', String(Math.round(size)));
  if (options.format) params.set('format', options.format);
  if (options.theme) params.set('theme', options.theme);
  if (options.greyscale) params.set('greyscale', 'true');
  if (options.retina) params.set('retina', 'true');
  if (options.fallback) params.set('fallback', options.fallback);

  return `${LOGO_CDN}/${encodeURIComponent(host)}?${params.toString()}`;
}

function isLogoDevConfigured() {
  return Boolean(config.logoDevToken);
}

/** Logo for any HTTPS URL (e.g. custom link favicon). */
function buildLogoUrlFromUrl(url, options = {}) {
  try {
    const host = new URL(url).hostname;
    return buildLogoUrl(host, options);
  } catch {
    return null;
  }
}

module.exports = { LOGO_CDN, buildLogoUrl, buildLogoUrlFromUrl, isLogoDevConfigured };
