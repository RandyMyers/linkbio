const { flutterwaveBaseUrl } = require('./gatewayPayments');

async function flutterwaveRequest(secretKey, path, { method = 'GET', body } = {}) {
  const url = `${flutterwaveBaseUrl()}${path}`;
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
    const err = new Error(data.message || data.error || `Flutterwave API ${res.status}`);
    err.statusCode = res.status >= 400 && res.status < 600 ? res.status : 502;
    err.data = data;
    throw err;
  }
  return data;
}

async function verifyTransactionById(secretKey, transactionId) {
  const data = await flutterwaveRequest(secretKey, `/transactions/${transactionId}/verify`);
  return data.data || data;
}

async function verifyTransactionByTxRef(secretKey, txRef) {
  const encoded = encodeURIComponent(txRef);
  const data = await flutterwaveRequest(secretKey, `/transactions/verify_by_reference?tx_ref=${encoded}`);
  return data.data || data;
}

module.exports = {
  verifyTransactionById,
  verifyTransactionByTxRef,
};
