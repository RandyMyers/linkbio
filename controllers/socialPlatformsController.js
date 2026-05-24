const SocialPlatform = require('../models/SocialPlatform');
const { seedSocialPlatforms } = require('../lib/seedSocialPlatforms');
const { serializePlatform, listPlatformsSerialized } = require('../lib/socialPlatforms');
const { buildLogoUrlFromUrl, isLogoDevConfigured } = require('../lib/logoDev');
const { asyncHandler } = require('../middleware/errorHandler');

async function loadPlatformRows() {
  const count = await SocialPlatform.countDocuments();
  if (count === 0) {
    await seedSocialPlatforms({ verifyLogos: false });
  }
  return SocialPlatform.find().sort({ sortOrder: 1, key: 1 }).lean();
}

exports.list = asyncHandler(async (req, res) => {
  const size = Math.min(128, Math.max(32, Number(req.query.size) || 64));
  const format = req.query.format === 'jpg' ? 'jpg' : 'png';
  const theme = req.query.theme === 'dark' || req.query.theme === 'light' ? req.query.theme : undefined;

  const rows = await loadPlatformRows();
  const platforms = rows.map((row) =>
    serializePlatform(row, { logoSize: size, format, theme, retina: req.query.retina === 'true' }),
  );

  res.json({
    platforms,
    logoDevEnabled: isLogoDevConfigured(),
  });
});

/** Resolve Logo.dev image URL for any HTTPS link (custom blocks, integrations). */
exports.logoForUrl = asyncHandler(async (req, res) => {
  const url = String(req.query.url || '').trim();
  if (!url) {
    res.status(400).json({ error: 'url query parameter required.' });
    return;
  }
  const size = Math.min(128, Math.max(32, Number(req.query.size) || 64));
  const format = req.query.format === 'jpg' ? 'jpg' : 'png';
  const theme = req.query.theme === 'dark' || req.query.theme === 'light' ? req.query.theme : undefined;
  const logoUrl = buildLogoUrlFromUrl(url, { size, format, theme });
  res.json({
    logoUrl,
    logoDevEnabled: isLogoDevConfigured(),
  });
});
