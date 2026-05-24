const crypto = require('crypto');
const GatewayPayment = require('../models/GatewayPayment');
const { getGatewayConfig } = require('./gatewayConfig');
const { verifyTransaction } = require('../lib/squadClient');
const { fulfillGatewayPayment, isSuccessfulStatus } = require('./gatewayPaymentFulfillment');

function verifySquadSignature(body, headerHash, secretKey) {
  if (!secretKey || !headerHash) return false;
  const hash = crypto
    .createHmac('sha512', secretKey)
    .update(JSON.stringify(body))
    .digest('hex')
    .toUpperCase();
  return hash === String(headerHash).toUpperCase();
}

async function handleSquadWebhook(body, headers) {
  const cfg = await getGatewayConfig('squad');
  if (!cfg?.secretKey) {
    const err = new Error('Squad not configured');
    err.statusCode = 503;
    throw err;
  }

  const encryptedHeader =
    headers['x-squad-encrypted-body'] || headers['x-squad-signature'] || '';
  if (encryptedHeader && !verifySquadSignature(body, encryptedHeader, cfg.secretKey)) {
    const err = new Error('Invalid Squad webhook signature');
    err.statusCode = 401;
    throw err;
  }

  const data = body.data || body;
  const transactionRef =
    data.transaction_ref ||
    data.TransactionRef ||
    data.transaction_reference ||
    body.transaction_ref;

  if (!transactionRef) return { ok: true, ignored: true };

  const record = await GatewayPayment.findOne({
    provider: 'squad',
    $or: [{ orderId: transactionRef }, { providerReference: transactionRef }],
  });
  if (!record) return { ok: true, ignored: true };

  const verified = await verifyTransaction(cfg.secretKey, transactionRef, cfg.environment);
  const status =
    verified.transaction_status ||
    verified.status ||
    verified.Status ||
    data.transaction_status;

  if (!isSuccessfulStatus('squad', status)) {
    return { ok: true, status };
  }

  return fulfillGatewayPayment(record, {
    status: 'successful',
    providerReference: transactionRef,
    metaPatch: { lastWebhook: body, lastVerify: verified },
  });
}

module.exports = { handleSquadWebhook, verifySquadSignature };
