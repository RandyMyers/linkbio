const { connectDb } = require('./lib/db');
const config = require('./config');
const { createApp } = require('./createApp');
const { validateEnv } = require('./utils/envValidator');
const { startSubscriptionJobs } = require('./jobs/subscriptionJobs');
const { startMarketingJobs } = require('./jobs/marketingJobs');

async function main() {
  validateEnv();
  await connectDb();
  startSubscriptionJobs();
  startMarketingJobs();
  const app = createApp();
  const server = app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[linkbio] API http://localhost:${config.port} (GET /health)`);
  });
  server.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[linkbio] listen error:', err.message);
    process.exit(1);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
