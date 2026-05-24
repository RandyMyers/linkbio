const BioProfile = require('../models/BioProfile');
const config = require('../config');
const { buildOgSvg, buildPublicJsonLd } = require('../services/ogImage');
const { normalizeUsername } = require('../lib/reservedUsernames');
const { asyncHandler } = require('../middleware/errorHandler');

exports.renderOg = asyncHandler(async (req, res) => {
  const username = normalizeUsername(req.params.username);
  const published = username ? await BioProfile.findPublicByUsername(username) : null;
  if (!published) {
    res.status(404).send('Not found');
    return;
  }

  const svg = buildOgSvg(published);
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', `public, max-age=${config.ogCacheTtlSec}`);
  res.send(svg);
});

exports.meta = asyncHandler(async (req, res) => {
  const username = normalizeUsername(req.params.username);
  const published = username ? await BioProfile.findPublicByUsername(username) : null;
  if (!published) {
    res.status(404).json({ error: 'Profile not found' });
    return;
  }

  const base = (config.appPublicUrl || config.clientOrigin).replace(/\/$/, '');
  const url = `${base}/@${username}`;
  const seo = published.seo || {};

  const canonical = seo.canonical || url;
  const image = seo.ogImage || `${base}/og/${username}.svg`;

  res.json({
    title: seo.title || `${published.name} (@${username}) | LinkBio`,
    description: seo.description || published.bio || '',
    image,
    keywords: seo.keywords || '',
    canonical,
    noIndex: Boolean(seo.noIndex),
    jsonLd: buildPublicJsonLd(published, canonical),
  });
});
