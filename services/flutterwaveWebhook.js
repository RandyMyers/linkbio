const GatewayPayment = require('../models/GatewayPayment');
const { getGatewayConfig } = require('./gatewayConfig');
const { verifyTransactionById } = require('../lib/flutterwaveClient');
const { fulfillGatewayPayment, isSuccessfulStatus } = require('./gatewayPaymentFulfillment');

async function handleFlutterwaveWebhook(body, headers) {
  const cfg = await getGatewayConfig('flutterwave');
  if (!cfg?.secretKey) {
    const err = new Error('Flutterwave not configured');
    err.statusCode = 503;
    throw err;
  }

  const secretHash = cfg.webhookSecretHash || cfg.ipnSecret || '';
  if (secretHash) {
    const headerHash = headers['verif-hash'] || headers['verif_hash'] || '';
    if (headerHash !== secretHash) {
      const err = new Error('Invalid Flutterwave webhook signature');
      err.statusCode = 401;
      throw err;
    }
  }

  const event = String(body.event || body.type || '').toLowerCase();
  const data = body.data || body;
  const txRef = data.tx_ref || data.txRef;
  const transactionId = data.id || data.transaction_id;

  if (!txRef && !transactionId) {
    return { ok: true, ignored: true };
  }

  let record = null;
  if (txRef) {
    record = await GatewayPayment.findOne({
      provider: 'flutterwave',
      $or: [{ orderId: txRef }, { providerReference: txRef }],
    });
  }

  const verified = transactionId
    ? await verifyTransactionById(cfg.secretKey, transactionId)
    : null;

  if (!record && verified?.tx_ref) {
    record = await GatewayPayment.findOne({
      provider: 'flutterwave',
      orderId: verified.tx_ref,
    });
  }

  if (!record) return { ok: true, ignored: true };

  const status = verified?.status || data.status;
  if (!isSuccessfulStatus('flutterwave', status) && !event.includes('successful')) {
    return { ok: true, status };
  }

  if (!verified && transactionId) {
    const err = new Error('Could not verify Flutterwave transaction');
    err.statusCode = 400;
    throw err;
  }

  return fulfillGatewayPayment(record, {
    status: 'successful',
    providerReference: String(transactionId || verified?.id || txRef),
    metaPatch: { lastWebhook: body },
  });
}

module.exports = { handleFlutterwaveWebhook };
