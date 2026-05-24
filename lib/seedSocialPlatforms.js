const https = require('https');
const SocialPlatform = require('../models/SocialPlatform');
const { SOCIAL_PLATFORM_CATALOG } = require('./socialPlatforms');
const { buildLogoUrl, isLogoDevConfigured } = require('./logoDev');
const config = require('../config');

/** Logo.dev CDN does not support HEAD — use a short GET. */
function probeLogoUrl(url) {
  return new Promise((resolve) => {
    if (!url) {
      resolve({ ok: false, status: 0 });
      return;
    }
    const req = https.get(url, { timeout: 12000 }, (res) => {
      res.resume();
      resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, status: res.statusCode });
    });
    req.on('error', () => resolve({ ok: false, status: 0 }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, status: 0 });
    });
  });
}

async function seedSocialPlatforms({ verifyLogos = true } = {}) {
  if (!isLogoDevConfigured()) {
    // eslint-disable-next-line no-console
    console.warn('[linkbio/seed] LOGO_DEV_TOKEN not set — seeding catalog without logo verification.');
  }

  const now = new Date();
  let verified = 0;

  for (const row of SOCIAL_PLATFORM_CATALOG) {
    let logoVerifyOk = null;
    let logoVerifiedAt = null;

    if (verifyLogos && row.logoDomain && isLogoDevConfigured()) {
      const testUrl = buildLogoUrl(row.logoDomain, { size: 64, format: 'png' });
      const result = await probeLogoUrl(testUrl);
      logoVerifyOk = result.ok;
      logoVerifiedAt = now;
      if (result.ok) verified += 1;
      else {
        // eslint-disable-next-line no-console
        console.warn(`[linkbio/seed] Logo.dev check failed for ${row.key} (${row.logoDomain}) status=${result.status}`);
      }
    }

    await SocialPlatform.findOneAndUpdate(
      { key: row.key },
      {
        key: row.key,
        label: row.label,
        emoji: row.emoji,
        logoDomain: row.logoDomain,
        placeholder: row.placeholder,
        sortOrder: row.sortOrder,
        logoVerifyOk,
        logoVerifiedAt,
      },
      { upsert: true, new: true },
    );
  }

  return {
    count: SOCIAL_PLATFORM_CATALOG.length,
    verified,
    tokenConfigured: isLogoDevConfigured(),
    secretConfigured: Boolean(config.logoDevSecret),
  };
}

module.exports = { seedSocialPlatforms };
