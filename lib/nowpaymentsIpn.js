const crypto = require('crypto');

function sortObject(obj) {
  return Object.keys(obj)
    .sort()
    .reduce((result, key) => {
      const val = obj[key];
      result[key] = val && typeof val === 'object' && !Array.isArray(val) ? sortObject(val) : val;
      return result;
    }, {});
}

function verifyIpnSignature(body, signatureHeader, ipnSecret) {
  if (!ipnSecret || !signatureHeader) return false;
  const sorted = sortObject(body);
  const payload = JSON.stringify(sorted);
  const hmac = crypto.createHmac('sha512', ipnSecret);
  hmac.update(payload);
  const expected = hmac.digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(String(signatureHeader), 'hex'));
  } catch {
    return expected === String(signatureHeader);
  }
}

const PAID_STATUSES = new Set(['finished', 'confirmed']);

function isPaidStatus(status) {
  return PAID_STATUSES.has(String(status || '').toLowerCase());
}

module.exports = { sortObject, verifyIpnSignature, isPaidStatus };
