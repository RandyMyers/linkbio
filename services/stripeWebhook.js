const GatewayCredential = require('../models/GatewayCredential');
const GatewayPayment = require('../models/GatewayPayment');
const config = require('../config');
const { decryptSecret } = require('../lib/secretCrypto');
const { constructWebhookEvent } = require('../lib/stripeClient');
const { fulfillGatewayPayment } = require('./gatewayPaymentFulfillment');
const { sessionMatchesRecord } = require('./stripeBilling');
const { retrieveCheckoutSession } = require('../lib/stripeClient');
function parsePayload(json) {
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}

async function loadStripeWebhookSecrets() {
  const rows = await GatewayCredential.find({ provider: 'stripe' }).lean();
  const secrets = [];
  for (const row of rows) {
    if (!row.encryptedValue || !config.secretsMasterKey) continue;
    try {
      const json = decryptSecret(
        {
          encryptedValue: row.encryptedValue,
          iv: row.iv,
          authTag: row.authTag,
        },
        config.secretsMasterKey,
      );
      const payload = parsePayload(json);
      const secret = payload.ipnSecret || payload.webhookSecret || '';
      const apiKey = payload.apiKey || '';
      if (secret) {
        secrets.push({
          environment: row.environment,
          webhookSecret: secret,
          apiKey,
        });
      }
    } catch {
      /* skip */
    }
  }
  return secrets;
}

async function constructStripeEvent(rawBody, signature) {
  const secrets = await loadStripeWebhookSecrets();
  if (!secrets.length) {
    const err = new Error('Stripe webhook secret not configured');
    err.statusCode = 503;
    throw err;
  }

  let lastError;
  for (const entry of secrets) {
    try {
      const event = constructWebhookEvent(rawBody, signature, entry.webhookSecret);
      return { event, ...entry };
    } catch (e) {
      lastError = e;
    }
  }

  const err = new Error('Invalid Stripe webhook signature');
  err.statusCode = 400;
  err.cause = lastError;
  throw err;
}

async function handleCheckoutSessionCompleted(session, apiKey) {
  const orderId = session.metadata?.orderId || session.client_reference_id || '';
  if (!orderId) return { ok: true, ignored: true };

  const record = await GatewayPayment.findOne({
    provider: 'stripe',
    orderId: String(orderId).trim(),
  });
  if (!record) return { ok: true, ignored: true };

  if (record.paymentStatus === 'successful') {
    return { ok: true, alreadyFulfilled: true };
  }

  let verifiedSession = session;
  if (apiKey && session.id) {
    try {
      verifiedSession = await retrieveCheckoutSession(apiKey, session.id);
    } catch {
      verifiedSession = session;
    }
  }

  if (!sessionMatchesRecord(verifiedSession, record)) {
    return { ok: true, ignored: true, reason: 'session_mismatch' };
  }

  return fulfillGatewayPayment(record, {
    status: 'successful',
    providerReference: verifiedSession.id,
    metaPatch: { lastWebhook: { type: 'checkout.session.completed', sessionId: verifiedSession.id } },
  });
}

async function markStripeCheckoutFailed(session, eventType) {
  const orderId = session.metadata?.orderId || session.client_reference_id || '';
  if (!orderId) return { ok: true, ignored: true };

  const record = await GatewayPayment.findOne({
    provider: 'stripe',
    orderId: String(orderId).trim(),
  });
  if (!record) return { ok: true, ignored: true };
  if (record.paymentStatus === 'successful') {
    return { ok: true, alreadyFulfilled: true };
  }

  record.paymentStatus = 'failed';
  record.meta = {
    ...record.meta,
    lastWebhook: {
      type: eventType,
      sessionId: session.id || '',
      paymentStatus: session.payment_status || '',
    },
  };
  await record.save();
  return { ok: true, status: 'failed', orderId: record.orderId };
}

async function handleStripeWebhook(rawBody, headers) {
  const signature = headers['stripe-signature'] || headers['Stripe-Signature'] || '';
  if (!signature) {
    const err = new Error('Missing Stripe-Signature header');
    err.statusCode = 400;
    throw err;
  }

  const { event, apiKey } = await constructStripeEvent(rawBody, signature);

  switch (event.type) {
    case 'checkout.session.completed':
      return handleCheckoutSessionCompleted(event.data.object, apiKey);
    case 'checkout.session.expired':
    case 'checkout.session.async_payment_failed':
      return markStripeCheckoutFailed(event.data.object, event.type);
    case 'payment_intent.payment_failed': {
      const pi = event.data.object;
      const orderId = pi.metadata?.orderId || '';
      if (!orderId) return { ok: true, ignored: true, type: event.type };
      return markStripeCheckoutFailed(
        { metadata: { orderId }, id: pi.id, payment_status: 'unpaid' },
        event.type,
      );
    }
    default:
      return { ok: true, ignored: true, type: event.type };
  }
}

module.exports = { handleStripeWebhook, markStripeCheckoutFailed };
