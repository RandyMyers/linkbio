require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

function required(name, fallback) {
  const v = process.env[name];
  if (v !== undefined && String(v).trim() !== '') return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required env: ${name}`);
}

function optional(name, fallback = '') {
  const v = process.env[name];
  if (v !== undefined && String(v).trim() !== '') return v;
  return fallback;
}

const jwtSecret = required('JWT_SECRET', 'dev-only-change-me-linkbio');
const clientOrigin = (process.env.CLIENT_ORIGIN || 'http://localhost:3000').replace(/\/$/, '');

module.exports = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: required('MONGODB_URI', process.env.MONGO_URL),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '14d',
  clientOrigin,
  eventIpSalt: required('EVENT_IP_SALT', 'dev-event-salt-change-me'),
  trustProxy: process.env.NODE_ENV === 'production' ? 1 : false,
  appPublicUrl: optional('APP_PUBLIC_URL', clientOrigin),
  apiPublicUrl: optional('API_PUBLIC_URL', `http://localhost:${Number(process.env.PORT || 4000)}`),

  nowpaymentsApiKey: optional('NOWPAYMENTS_API_KEY'),
  nowpaymentsIpnSecret: optional('NOWPAYMENTS_IPN_SECRET'),
  nowpaymentsIpnCallbackUrl: optional('NOWPAYMENTS_IPN_CALLBACK_URL'),

  cloudinaryCloudName: optional('CLOUDINARY_CLOUD_NAME'),
  cloudinaryApiKey: optional('CLOUDINARY_API_KEY'),
  cloudinaryApiSecret: optional('CLOUDINARY_API_SECRET'),

  paymentInstructionsBank: optional('PAYMENT_INSTRUCTIONS_BANK'),
  paymentInstructionsCrypto: optional('PAYMENT_INSTRUCTIONS_CRYPTO'),

  adminEmails: optional('ADMIN_EMAILS')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),

  secretsMasterKey: optional('SECRETS_MASTER_KEY'),
  customDomainCnameTarget: optional('CUSTOM_DOMAIN_CNAME_TARGET', 'proxy.linkbio.app'),
  ogCacheTtlSec: Number(process.env.OG_CACHE_TTL_SEC || 3600),

  /** Logo.dev publishable key (pk_) — safe in img URLs */
  logoDevToken: optional('LOGO_DEV_TOKEN'),
  /** Logo.dev secret (sk_) — server-only; Brand/search APIs */
  logoDevSecret: optional('LOGO_DEV_SECRET'),
};
