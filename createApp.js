require('express-async-errors');
const os = require('os');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const fileUpload = require('express-fileupload');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const requestId = require('./middleware/requestId');
const { errorHandler } = require('./middleware/errorHandler');
const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const accountRoutes = require('./routes/account');
const profileRoutes = require('./routes/profile');
const profilesRoutes = require('./routes/profiles');
const eventRoutes = require('./routes/events');
const analyticsRoutes = require('./routes/analytics');
const plansRoutes = require('./routes/plans');
const billingRoutes = require('./routes/billing');
const notificationsRoutes = require('./routes/notifications');
const uploadRoutes = require('./routes/upload');
const domainRoutes = require('./routes/domains');
const adminRoutes = require('./routes/admin');
const adminAuthRoutes = require('./routes/adminAuth');
const webhooksRoutes = require('./routes/webhooks');
const stripeWebhookController = require('./controllers/stripeWebhookController');
const blocksRoutes = require('./routes/blocks');
const commerceRoutes = require('./routes/commerce');
const subscribersRoutes = require('./routes/subscribers');
const webhooksOutRoutes = require('./routes/webhooksOut');
const publicExtrasRoutes = require('./routes/publicExtras');
const socialPlatformsRoutes = require('./routes/socialPlatforms');
const ogController = require('./controllers/ogController');
const robotsController = require('./controllers/robotsController');
const sitemapController = require('./controllers/sitemapController');

/** Browser origins allowed to call this API (credentials / cookies). */
const CORS_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://courageous-cocada-20fd5a.netlify.app',
];

const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }
    const normalized = String(origin).replace(/\/$/, '');
    if (CORS_ALLOWED_ORIGINS.includes(normalized)) {
      callback(null, normalized);
      return;
    }
    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-LinkBio-Profile-Id',
    'Accept',
  ],
  optionsSuccessStatus: 204,
};

function createApp() {
  const app = express();

  if (config.trustProxy) {
    app.set('trust proxy', config.trustProxy);
  }

  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));
  app.use(requestId);
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.post(
    '/api/webhooks/stripe',
    express.raw({ type: 'application/json' }),
    stripeWebhookController.handleWebhook,
  );
  app.use('/api/webhooks', express.json(), webhooksRoutes);

  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));
  app.use(
    fileUpload({
      limits: { fileSize: 10 * 1024 * 1024 },
      abortOnLimit: true,
      useTempFiles: true,
      tempFileDir: os.tmpdir(),
    }),
  );
  app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  });
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: config.nodeEnv === 'production' ? 20 : 100,
    standardHeaders: true,
    legacyHeaders: false,
  });
  const eventsLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: config.nodeEnv === 'production' ? 200 : 500,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use('/api/', apiLimiter);
  app.use('/api/auth/', authLimiter);
  app.use('/api/events', eventsLimiter);

  app.get('/sitemap.xml', sitemapController.sitemap);
  app.get('/robots.txt', robotsController.robots);
  app.get('/og/:username.svg', ogController.renderOg);

  app.use(healthRoutes);
  app.use('/api/admin', adminAuthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api', accountRoutes);
  app.use('/api', publicExtrasRoutes);
  app.use('/api', socialPlatformsRoutes);
  app.use('/api', profileRoutes);
  app.use('/api', profilesRoutes);
  app.use('/api', eventRoutes);
  app.use('/api', analyticsRoutes);
  app.use('/api', plansRoutes);
  app.use('/api', billingRoutes);
  app.use('/api', notificationsRoutes);
  app.use('/api', uploadRoutes);
  app.use('/api', domainRoutes);
  app.use('/api', blocksRoutes);
  app.use('/api', commerceRoutes);
  app.use('/api', subscribersRoutes);
  app.use('/api', webhooksOutRoutes);
  app.use('/api', adminRoutes);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
