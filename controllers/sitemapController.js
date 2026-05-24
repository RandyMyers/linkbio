const BioProfile = require('../models/BioProfile');
const config = require('../config');
const { asyncHandler } = require('../middleware/errorHandler');

exports.sitemap = asyncHandler(async (_req, res) => {
  const base = (config.appPublicUrl || config.clientOrigin).replace(/\/$/, '');
  const profiles = await BioProfile.find({ published: { $ne: null } })
    .select('username publishedAt updatedAt')
    .limit(5000)
    .lean();

  const urls = profiles
    .filter((p) => !p.published?.seo?.noIndex)
    .map((p) => {
      const lastmod = (p.publishedAt || p.updatedAt || new Date()).toISOString().slice(0, 10);
      return `  <url><loc>${base}/@${p.username}</loc><lastmod>${lastmod}</lastmod></url>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  res.type('application/xml').send(xml);
});
