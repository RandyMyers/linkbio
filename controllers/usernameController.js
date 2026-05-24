const BioProfile = require('../models/BioProfile');
const { validateUsernameFormat } = require('../lib/reservedUsernames');
const { asyncHandler } = require('../middleware/errorHandler');

exports.checkAvailable = asyncHandler(async (req, res) => {
  const check = validateUsernameFormat(req.query.username);
  if (!check.ok) {
    res.json({ available: false, reason: check.reason });
    return;
  }

  const taken = await BioProfile.findOne({ username: check.username }).select('_id').lean();
  if (taken) {
    res.json({ available: false, reason: 'Username already taken.' });
    return;
  }

  res.json({ available: true });
});
