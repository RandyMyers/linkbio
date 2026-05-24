const config = require('../config');
const GatewayCredential = require('../models/GatewayCredential');
const PlatformSettings = require('../models/PlatformSettings');
const { encryptSecret, maskSecret } = require('../lib/secretCrypto');
const { normalizeEnvironment, getGatewayRuntimeMode } = require('../lib/gatewayRuntime');
const {
  invalidateGatewayCache,
  getGatewayConfig,
  getGatewayCredentialPayload,
  PROVIDERS,
} = require('../services/gatewayConfig');
const { getApiStatus } = require('../lib/nowpaymentsClient');
const { asyncHandler } = require('../middleware/errorHandler');

const ALLOWED_PROVIDERS = new Set(PROVIDERS);

function requireSecretsKey(res) {
  if (!config.secretsMasterKey) {
    res.status(503).json({
      error: 'SECRETS_MASTER_KEY not set — cannot store gateway credentials in the DB.',
      configured: false,
    });
    return false;
  }
  return true;
}

function toPublic(row) {
  if (!row) return null;
  return {
    id: row._id?.toString(),
    provider: row.provider,
    configured: true,
    source: 'db',
    maskedApiKey: row.maskedApiKey || '',
    environment: row.environment || 'production',
    label: row.label || '',
    isActive: !!row.isActive,
    lastRotatedAt: row.lastRotatedAt || row.updatedAt || null,
    updatedAt: row.updatedAt,
    createdAt: row.createdAt,
  };
}

exports.listGateways = asyncHandler(async (req, res) => {
  const runtimeMode = await getGatewayRuntimeMode();
  const rows = await GatewayCredential.find({}).sort({ provider: 1, environment: 1 }).lean();
  const items = rows.map((r) => toPublic(r));

  const envFallback =
    config.nowpaymentsApiKey && !rows.some((r) => r.provider === 'nowpayments' && r.environment === 'production')
      ? {
          provider: 'nowpayments',
          environment: 'production',
          configured: true,
          source: 'env',
          maskedApiKey: maskSecret(config.nowpaymentsApiKey),
          label: 'Environment variables (.env)',
          isEnvFallback: true,
        }
      : null;

  res.json({
    items,
    runtimeMode,
    providers: PROVIDERS,
    envFallback,
    secretsStorageConfigured: Boolean(config.secretsMasterKey),
  });
});

exports.getGateway = asyncHandler(async (req, res) => {
  const provider = String(req.params.provider || '').toLowerCase().trim();
  if (!ALLOWED_PROVIDERS.has(provider)) {
    res.status(400).json({ error: 'Unknown provider' });
    return;
  }
  const environment = normalizeEnvironment(req.query.environment);
  const row = await GatewayCredential.findOne({ provider, environment }).lean();
  const cfg = await getGatewayConfig(provider, { bypassCache: true, environment });

  if (row) {
    const creds = await getGatewayCredentialPayload(provider, environment);
    let extra = {};
    if (creds && typeof creds === 'object') {
      const {
        apiKey: _a,
        ipnSecret: _s,
        ipnCallbackUrl: _u,
        source: _src,
        row: _row,
        environment: _env,
        ...rest
      } = creds;
      extra = rest;
    }
    res.json({
      ...toPublic(row),
      ipnCallbackUrl: creds?.ipnCallbackUrl || cfg?.ipnCallbackUrl || '',
      extra,
    });
    return;
  }

  if (provider === 'nowpayments' && environment === 'production' && config.nowpaymentsApiKey) {
    res.json({
      provider,
      environment,
      configured: true,
      source: 'env',
      maskedApiKey: maskSecret(config.nowpaymentsApiKey),
      ipnCallbackUrl: cfg?.ipnCallbackUrl || '',
      label: 'Environment variables',
      isEnvFallback: true,
    });
    return;
  }

  res.json({
    provider,
    environment,
    configured: false,
    source: 'none',
    maskedApiKey: '',
    label: '',
  });
});

exports.upsertGateway = asyncHandler(async (req, res) => {
  if (!requireSecretsKey(res)) return;
  const provider = String(req.params.provider || '').toLowerCase().trim();
  if (!ALLOWED_PROVIDERS.has(provider)) {
    res.status(400).json({ error: 'Unknown provider' });
    return;
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const apiKey = String(body.apiKey || '').trim();
  const ipnSecret = String(body.ipnSecret || '').trim();
  const ipnCallbackUrl = String(body.ipnCallbackUrl || '').trim();
  const label = String(body.label || `${provider} (${body.environment || 'sandbox'})`)
    .trim()
    .slice(0, 120);
  const environment = normalizeEnvironment(body.environment);

  const extra = body.extra && typeof body.extra === 'object' ? body.extra : {};
  const publicKey = String(
    extra.publicKey || extra.publishableKey || body.publicKey || '',
  ).trim();

  const existing = await GatewayCredential.findOne({ provider, environment }).lean();
  if (!apiKey && !existing) {
    res.status(400).json({ error: 'Secret key is required' });
    return;
  }
  if ((provider === 'flutterwave' || provider === 'squad') && !publicKey && !existing) {
    res.status(400).json({ error: 'Public key is required' });
    return;
  }

  let payloadObj = {};
  if (existing?.encryptedValue && config.secretsMasterKey && !apiKey) {
    try {
      const { decryptSecret } = require('../lib/secretCrypto');
      const json = decryptSecret(
        {
          encryptedValue: existing.encryptedValue,
          iv: existing.iv,
          authTag: existing.authTag,
        },
        config.secretsMasterKey,
      );
      payloadObj = JSON.parse(json);
    } catch {
      payloadObj = {};
    }
  }

  if (apiKey) payloadObj.apiKey = apiKey;
  if (ipnSecret) payloadObj.ipnSecret = ipnSecret;
  if (ipnCallbackUrl) payloadObj.ipnCallbackUrl = ipnCallbackUrl;
  if (publicKey) {
    payloadObj.publicKey = publicKey;
    payloadObj.publishableKey = publicKey;
  } else if (payloadObj.publicKey) {
    /* keep existing public key */
  }

  const payload = JSON.stringify(payloadObj);
  const keyForMask = apiKey || payloadObj.apiKey || '';
  const enc = encryptSecret(payload, config.secretsMasterKey);

  const doc = await GatewayCredential.findOneAndUpdate(
    { provider, environment },
    {
      $set: {
        label,
        environment,
        encryptedValue: enc.encryptedValue,
        iv: enc.iv,
        authTag: enc.authTag,
        maskedApiKey: maskSecret(keyForMask),
        isActive: true,
        lastRotatedAt: new Date(),
        updatedBy: req.userEmail || 'admin',
      },
      $setOnInsert: {
        provider,
        createdBy: req.userEmail || 'admin',
      },
    },
    { upsert: true, new: true },
  );

  invalidateGatewayCache();
  const cfg = await getGatewayConfig(provider, { bypassCache: true, environment });
  res.json({
    ok: true,
    gateway: {
      ...toPublic(doc.toObject()),
      ipnCallbackUrl: ipnCallbackUrl || cfg?.ipnCallbackUrl || '',
    },
  });
});

exports.testGateway = asyncHandler(async (req, res) => {
  const provider = String(req.params.provider || '').toLowerCase().trim();
  if (provider !== 'nowpayments') {
    res.status(400).json({ error: 'Test only supported for nowpayments' });
    return;
  }
  const environment = normalizeEnvironment(req.query.environment || req.body?.environment);
  const creds = await getGatewayCredentialPayload(provider, environment);
  if (!creds?.apiKey) {
    res.status(503).json({
      error: `No ${environment} credentials for NOWPayments. Add a gateway or use production .env.`,
    });
    return;
  }
  try {
    const status = await getApiStatus(creds.apiKey);
    res.json({ ok: true, environment, status });
  } catch (e) {
    res.status(e.statusCode || 502).json({ error: e.message, data: e.data });
  }
});

exports.deleteGateway = asyncHandler(async (req, res) => {
  const provider = String(req.params.provider || '').toLowerCase().trim();
  if (!ALLOWED_PROVIDERS.has(provider)) {
    res.status(400).json({ error: 'Unknown provider' });
    return;
  }
  const environment = normalizeEnvironment(req.query.environment);
  const doc = await GatewayCredential.findOneAndDelete({ provider, environment });
  if (!doc) {
    res.status(404).json({ error: 'Gateway credentials not found for this environment' });
    return;
  }
  invalidateGatewayCache();
  res.json({
    ok: true,
    message: `Removed ${provider} (${environment}) credentials.`,
  });
});

exports.patchRuntimeMode = asyncHandler(async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const mode = normalizeEnvironment(body.gatewayRuntimeMode || body.mode);
  const doc = await PlatformSettings.findOneAndUpdate(
    { _id: 'global' },
    {
      $set: {
        gatewayRuntimeMode: mode,
        updatedBy: req.userEmail || 'admin',
      },
    },
    { upsert: true, new: true },
  ).lean();
  invalidateGatewayCache();
  res.json({
    ok: true,
    runtimeMode: doc.gatewayRuntimeMode === 'production' ? 'production' : 'sandbox',
  });
});
