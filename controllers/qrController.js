const BioProfile = require('../models/BioProfile');
const config = require('../config');
const { normalizeUsername } = require('../lib/reservedUsernames');
const { asyncHandler } = require('../middleware/errorHandler');

exports.profileQr = asyncHandler(async (req, res) => {
  const username = normalizeUsername(req.params.username);
  const published = username ? await BioProfile.findPublicByUsername(username) : null;
  if (!published) {
    res.status(404).send('Not found');
    return;
  }

  const base = (config.appPublicUrl || config.clientOrigin).replace(/\/$/, '');
  const target = `${base}/@${username}`;
  const encoded = encodeURIComponent(target);

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="280" height="280" viewBox="0 0 280 280">
  <rect width="280" height="280" fill="#ffffff"/>
  <text x="20" y="130" font-family="monospace" font-size="11" fill="#111">${encoded.slice(0, 40)}</text>
  <text x="20" y="160" font-family="system-ui" font-size="14" fill="#333">Scan → ${username}</text>
</svg>`;

  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(svg);
});
