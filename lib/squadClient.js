const { squadBaseUrl, SQUAD_CARD_CHANNELS } = require('./gatewayPayments');

async function squadRequest(secretKey, path, { method = 'POST', body, environment = 'sandbox' } = {}) {
  const base = squadBaseUrl(environment);
  const url = `${base}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(
      data.message || data.title || `Squad API ${res.status}`,
    );
    err.statusCode = res.status >= 400 && res.status < 600 ? res.status : 502;
    err.data = data;
    throw err;
  }
  return data;
}

/**
 * Card-only inline checkout — POST /payment/Initiate
 */
async function initiateCardPayment(
  secretKey,
  {
    email,
    amountMinor,
    currency,
    transactionRef,
    customerName,
    callbackUrl,
    metadata,
    environment,
  },
) {
  const payload = {
    email,
    amount: String(amountMinor),
    currency: String(currency).toUpperCase(),
    initiate_type: 'inline',
    transaction_ref: transactionRef,
    customer_name: customerName || email,
    callback_url: callbackUrl,
    payment_channels: SQUAD_CARD_CHANNELS,
    metadata: metadata || {},
  };

  const data = await squadRequest(secretKey, '/payment/Initiate', {
    body: payload,
    environment,
  });
  return data.data || data;
}

/** Verify transaction after redirect or webhook. */
async function verifyTransaction(secretKey, transactionRef, environment) {
  const encoded = encodeURIComponent(transactionRef);
  try {
    const data = await squadRequest(secretKey, `/transaction/verify/${encoded}`, {
      method: 'GET',
      environment,
    });
    return data.data || data;
  } catch (e) {
    if (e.statusCode !== 404) throw e;
    const data = await squadRequest(secretKey, '/transaction/verify', {
      body: { transaction_ref: transactionRef },
      environment,
    });
    return data.data || data;
  }
}

module.exports = {
  initiateCardPayment,
  verifyTransaction,
};
