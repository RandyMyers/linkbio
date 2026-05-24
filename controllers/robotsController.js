const config = require('../config');

exports.robots = (_req, res) => {
  const base = (config.appPublicUrl || config.clientOrigin).replace(/\/$/, '');
  const body = `User-agent: *
Allow: /
Sitemap: ${base}/sitemap.xml
`;
  res.type('text/plain').send(body);
};
