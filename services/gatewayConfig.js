const config = require('../config');
const GatewayCredential = require('../models/GatewayCredential');
const { decryptSecret } = require('../lib/secretCrypto');
const { getGatewayRuntimeMode } = require('../lib/gatewayRuntime');

const PROVIDERS = ['nowpayments', 'stripe', 'paypal', 'flutterwave', 'squad'];

let cache = { at: 0, byProvider: {} };
const CACHE_MS = 30_000;

function parsePayload(json) {
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}

async function loadActiveCredential(provider, environment) {
  const env = environment || (await getGatewayRuntimeMode());
  const row = await GatewayCredential.findOne({ provider, environment: env }).lean();
  if (!row?.encryptedValue || !config.secretsMasterKey) return null;
  try {
    const json = decryptSecret(
      {
        encryptedValue: row.encryptedValue,
        iv: row.iv,
        authTag: row.authTag,
      },
      config.secretsMasterKey,
    );
    return { row, payload: parsePayload(json) };
  } catch {
    return null;
  }
}

async function getGatewayConfig(provider, { bypassCache = false, environment } = {}) {
  const runtimeEnv = environment || (await getGatewayRuntimeMode());
  const cacheKey = `${provider}:${runtimeEnv}`;
  const now = Date.now();
  if (!bypassCache && cache.at && now - cache.at < CACHE_MS && cache.byProvider[cacheKey]) {
    return cache.byProvider[cacheKey];
  }

  let resolved = null;
  const fromDb = await loadActiveCredential(provider, runtimeEnv);
  if (fromDb?.payload) {
    resolved = { source: 'db', row: fromDb.row, ...fromDb.payload };
  }

  if (provider === 'flutterwave' || provider === 'squad' || provider === 'stripe') {
    if (resolved) {
      resolved.environment = runtimeEnv;
      resolved.secretKey = resolved.apiKey || '';
      resolved.publicKey =
        resolved.publicKey ||
        resolved.publishableKey ||
        resolved.extra?.publicKey ||
        resolved.extra?.publishableKey ||
        '';
      resolved.webhookSecret = resolved.webhookSecret || resolved.ipnSecret || '';
      resolved.webhookSecretHash = resolved.webhookSecretHash || resolved.ipnSecret || '';
      resolved.configured = Boolean(resolved.secretKey);
      if (provider === 'flutterwave') {
        resolved.configured = Boolean(resolved.secretKey && resolved.publicKey);
      }
      if (provider === 'stripe') {
        resolved.configured = Boolean(resolved.secretKey);
      }
    } else {
      resolved = { source: 'none', configured: false, environment: runtimeEnv };
    }
  }

  if (provider === 'nowpayments') {
    if (!resolved?.apiKey && runtimeEnv === 'production' && config.nowpaymentsApiKey) {
      resolved = {
        source: 'env',
        environment: runtimeEnv,
        apiKey: config.nowpaymentsApiKey,
        ipnSecret: config.nowpaymentsIpnSecret || '',
        ipnCallbackUrl: config.nowpaymentsIpnCallbackUrl || '',
      };
    }
    if (resolved) {
      resolved.environment = runtimeEnv;
      resolved.configured = Boolean(resolved.apiKey);
      resolved.ipnCallbackUrl =
        resolved.ipnCallbackUrl ||
        config.nowpaymentsIpnCallbackUrl ||
        `${config.apiPublicUrl.replace(/\/$/, '')}/api/webhooks/nowpayments`;
    } else {
      resolved = { source: 'none', configured: false, environment: runtimeEnv };
    }
  }

  cache.byProvider[cacheKey] = resolved;
  cache.at = now;
  return resolved;
}

/** Prefer runtime env, then fall back to the other env so mixed sandbox/live gateways still work. */
async function resolveGatewayConfig(provider, { bypassCache = false } = {}) {
  const runtimeEnv = await getGatewayRuntimeMode();
  const environments =
    runtimeEnv === 'production' ? ['production', 'sandbox'] : ['sandbox', 'production'];

  for (const environment of environments) {
    const cfg = await getGatewayConfig(provider, { bypassCache, environment });
    if (cfg?.configured) return cfg;
  }

  return getGatewayConfig(provider, { bypassCache, environment: runtimeEnv });
}

async function getGatewayCredentialPayload(provider, environment) {
  const fromDb = await loadActiveCredential(provider, environment);
  if (fromDb?.payload) {
    return { source: 'db', environment, ...fromDb.payload, row: fromDb.row };
  }
  if (environment === 'production' && provider === 'nowpayments' && config.nowpaymentsApiKey) {
    return {
      source: 'env',
      environment,
      apiKey: config.nowpaymentsApiKey,
      ipnSecret: config.nowpaymentsIpnSecret || '',
      ipnCallbackUrl: config.nowpaymentsIpnCallbackUrl || '',
    };
  }
  return null;
}

function invalidateGatewayCache() {
  cache = { at: 0, byProvider: {} };
}

async function isNowPaymentsConfigured() {
  const cfg = await resolveGatewayConfig('nowpayments');
  return Boolean(cfg?.configured && cfg?.apiKey);
}

async function getNowPaymentsApiKey() {
  const cfg = await resolveGatewayConfig('nowpayments');
  return cfg?.apiKey || '';
}

async function getNowPaymentsIpnSecret() {
  const cfg = await resolveGatewayConfig('nowpayments');
  return cfg?.ipnSecret || config.nowpaymentsIpnSecret || '';
}

async function isFlutterwaveConfigured() {
  const cfg = await resolveGatewayConfig('flutterwave');
  return Boolean(cfg?.configured);
}

async function isSquadConfigured() {
  const cfg = await resolveGatewayConfig('squad');
  return Boolean(cfg?.configured);
}

async function isStripeConfigured() {
  const cfg = await resolveGatewayConfig('stripe');
  return Boolean(cfg?.configured);
}

module.exports = {
  PROVIDERS,
  getGatewayConfig,
  resolveGatewayConfig,
  getGatewayCredentialPayload,
  invalidateGatewayCache,
  isNowPaymentsConfigured,
  getNowPaymentsApiKey,
  getNowPaymentsIpnSecret,
  isFlutterwaveConfigured,
  isSquadConfigured,
  isStripeConfigured,
};
