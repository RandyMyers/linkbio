/**
 * Parse informal gateway key notes from gateway keys.txt.
 * Supports Flutterwave, Stripe, and NOWPayments blocks.
 */
function firstMatch(text, pattern) {
  const m = text.match(pattern);
  return m ? m[1] || m[0] : '';
}

function parseGatewayKeysFile(text) {
  const normalized = String(text || '');
  const entries = [];

  const flutterPublic = firstMatch(normalized, /FLWPUBK_TEST-[A-Za-z0-9-]+/);
  const flutterSecret = firstMatch(normalized, /FLWSECK_TEST-[A-Za-z0-9-]+/);
  const flutterWebhook =
    firstMatch(normalized, /"FLWSECK_TEST[^"]+"/)?.replace(/"/g, '') ||
    firstMatch(normalized, /webhookSecret[\s\S]*?(FLWSECK_TEST[A-Za-z0-9]+)/i);

  if (flutterPublic && flutterSecret) {
    entries.push({
      provider: 'flutterwave',
      environment: 'sandbox',
      label: 'Flutterwave (sandbox)',
      apiKey: flutterSecret,
      publicKey: flutterPublic,
      ipnSecret: flutterWebhook || '',
    });
  }

  const stripeSection =
    normalized.match(/Stripe[^]*?(?=nowpayments\.io|$)/i)?.[0] || normalized;
  const stripePublishable = firstMatch(
    stripeSection,
    /(?:public key|publishable key):\s*(pk_(?:live|test)_[A-Za-z0-9]+)/i,
  );
  const stripeSecret = firstMatch(stripeSection, /(?:secret key):\s*(sk_(?:live|test)_[A-Za-z0-9]+)/i);

  if (stripePublishable && stripeSecret) {
    const labeled = stripeSection.match(/Stripe:\s*(sandbox|test|live|production)/i);
    let environment = 'sandbox';
    if (labeled) {
      const word = labeled[1].toLowerCase();
      environment = word === 'live' || word === 'production' ? 'production' : 'sandbox';
    } else if (/pk_live_|sk_live_/.test(`${stripePublishable}${stripeSecret}`)) {
      environment = 'production';
    }
    entries.push({
      provider: 'stripe',
      environment,
      label: `Stripe (${environment})`,
      apiKey: stripeSecret,
      publishableKey: stripePublishable,
    });
  }

  const nowApiKey = firstMatch(normalized, /API key:\s*([A-Z0-9-]+)/i);
  const nowPublicKey = firstMatch(normalized, /public key:\s*([a-f0-9-]+)/i);
  const nowIpn = firstMatch(normalized, /IPN Key:\s*(\S+)/i);
  const nowIsLive = /nowpayments\.io:\s*live/i.test(normalized);

  if (nowApiKey) {
    entries.push({
      provider: 'nowpayments',
      environment: nowIsLive ? 'production' : 'sandbox',
      label: `NOWPayments (${nowIsLive ? 'production' : 'sandbox'})`,
      apiKey: nowApiKey,
      ipnSecret: nowIpn || '',
      publicKey: nowPublicKey || '',
    });
  }

  return entries;
}

module.exports = { parseGatewayKeysFile };
