const {
  isNowPaymentsConfigured,
  getNowPaymentsApiKey,
  getGatewayConfig,
} = require('../services/gatewayConfig');

/**
 * NOWPayments REST API — see linkbio/nowpayments.txt
 */
const API_BASE = 'https://api.nowpayments.io/v1';

function billingDisabledResponse(res, code = 'BILLING_DISABLED') {
  res.status(503).json({
    error: 'Crypto billing is not configured. Add NOWPayments keys in admin or .env.',
    code,
  });
}

async function npFetch(path, options = {}, apiKeyOverride) {
  const apiKey = apiKeyOverride || (await getNowPaymentsApiKey());
  if (!apiKey) {
    throw new Error('NOWPayments API key not configured');
  }
  const url = `${API_BASE}${path}`;
  const headers = {
    'x-api-key': apiKey,
    'Content-Type': 'application/json',
    ...options.headers,
  };
  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(data.message || data.error || `NOWPayments HTTP ${res.status}`);
    err.statusCode = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function getApiStatus(apiKeyOverride) {
  return npFetch('/status', {}, apiKeyOverride);
}

async function createInvoice({
  priceAmount,
  priceCurrency = 'usd',
  orderId,
  orderDescription,
  successUrl,
  cancelUrl,
  ipnCallbackUrl,
}) {
  return npFetch('/invoice', {
    method: 'POST',
    body: JSON.stringify({
      price_amount: priceAmount,
      price_currency: priceCurrency,
      order_id: orderId,
      order_description: orderDescription,
      success_url: successUrl,
      cancel_url: cancelUrl,
      ipn_callback_url: ipnCallbackUrl,
    }),
  });
}

async function getPayment(paymentId) {
  return npFetch(`/payment/${paymentId}`);
}

module.exports = {
  isNowPaymentsConfigured,
  billingDisabledResponse,
  getApiStatus,
  createInvoice,
  getPayment,
  getGatewayConfig,
};
