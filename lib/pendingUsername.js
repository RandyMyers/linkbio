const crypto = require('crypto');
const BioProfile = require('../models/BioProfile');
const { validateUsernameFormat } = require('./reservedUsernames');

function isInternalUsername(username) {
  return String(username || '').toLowerCase().startsWith('lb_');
}

async function allocatePendingUsername() {
  for (let i = 0; i < 20; i += 1) {
    const raw = `lb_${crypto.randomBytes(4).toString('hex')}`;
    const check = validateUsernameFormat(raw);
    if (!check.ok) continue;
    const taken = await BioProfile.findOne({ username: check.username }).select('_id').lean();
    if (!taken) return check.username;
  }
  throw new Error('Could not allocate a temporary username.');
}

module.exports = { isInternalUsername, allocatePendingUsername };
