const BioProfile = require('../models/BioProfile');
const CustomDomain = require('../models/CustomDomain');
const { normalizeUsername } = require('../lib/reservedUsernames');
const { asyncHandler } = require('../middleware/errorHandler');

function normalizeHost(raw) {
  return String(raw || '')
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');
}

exports.getByUsername = asyncHandler(async (req, res) => {
  const username = normalizeUsername(req.params.username);
  if (!username) {
    res.status(404).json({ error: 'Profile not found' });
    return;
  }

  const published = await BioProfile.findPublicByUsername(username);
  if (!published) {
    res.status(404).json({ error: 'Profile not found' });
    return;
  }

  res.json(published);
});

exports.getByHost = asyncHandler(async (req, res) => {
  const hostname = normalizeHost(req.query.hostname || req.query.host);
  if (!hostname) {
    res.status(400).json({ error: 'hostname query required' });
    return;
  }

  const domain = await CustomDomain.findOne({
    hostname,
    status: { $in: ['verified', 'active'] },
  }).lean();

  if (!domain) {
    res.status(404).json({ error: 'Profile not found' });
    return;
  }

  const profile = await BioProfile.findById(domain.profileId).lean();
  if (!profile?.username) {
    res.status(404).json({ error: 'Profile not found' });
    return;
  }

  const published = await BioProfile.findPublicByUsername(profile.username);
  if (!published) {
    res.status(404).json({ error: 'Profile not found' });
    return;
  }

  res.json(published);
});
