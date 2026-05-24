const crypto = require('crypto');

function subscriberHash(email) {
  return crypto.createHash('md5').update(String(email || '').trim().toLowerCase()).digest('hex');
}

module.exports = { subscriberHash };
