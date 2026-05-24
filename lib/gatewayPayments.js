const crypto = require('crypto');

function buildOrderId(prefix, userId, planSlug) {
  const slug = String(planSlug || 'plan')
    .replace(/[^a-z0-9]/gi, '')
    .slice(0, 12);
  return `lb_${prefix}_${userId}_${slug}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

/** Major units (10.5 USD) → minor units (1050 cents/kobo). */
function toMinorUnits(amountMajor, currency) {
  const n = Number(amountMajor);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function flutterwaveBaseUrl() {
  return 'https://api.flutterwave.com/v3';
}

function squadBaseUrl(environment) {
  return environment === 'production'
    ? 'https://api.squadco.com'
    : 'https://sandbox-api.squadco.com';
}

const FLUTTERWAVE_CARD_OPTIONS = 'card';
const SQUAD_CARD_CHANNELS = ['card'];

module.exports = {
  buildOrderId,
  toMinorUnits,
  flutterwaveBaseUrl,
  squadBaseUrl,
  FLUTTERWAVE_CARD_OPTIONS,
  SQUAD_CARD_CHANNELS,
};
