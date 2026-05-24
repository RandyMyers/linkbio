const config = require('../config');

function validateEnv() {
  const warnings = [];

  if (config.jwtSecret === 'dev-only-change-me-linkbio' && config.nodeEnv === 'production') {
    throw new Error('JWT_SECRET must be changed in production.');
  }

  if (!config.nowpaymentsApiKey) {
    warnings.push('NOWPAYMENTS_API_KEY not set — crypto checkout disabled.');
  }
  if (config.nowpaymentsApiKey && !config.nowpaymentsIpnSecret) {
    warnings.push('NOWPAYMENTS_IPN_SECRET not set — webhooks cannot be verified.');
  }
  if (!config.cloudinaryCloudName) {
    warnings.push('Cloudinary not set — uploads disabled.');
  }
  if (!config.paymentInstructionsBank) {
    warnings.push('PAYMENT_INSTRUCTIONS_BANK not set — bank transfer instructions empty.');
  }
  if (!config.logoDevToken) {
    warnings.push('LOGO_DEV_TOKEN not set — social platform logos will use emoji fallbacks.');
  }

  for (const w of warnings) {
    // eslint-disable-next-line no-console
    console.warn(`[linkbio/env] ${w}`);
  }
}

module.exports = { validateEnv };
