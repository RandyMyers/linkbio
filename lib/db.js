const mongoose = require('mongoose');
const config = require('../config');

let connecting;

async function connectDb() {
  if (mongoose.connection.readyState === 1) return;
  if (connecting) {
    await connecting;
    return;
  }
  connecting = mongoose.connect(config.mongoUri);
  await connecting;
  connecting = null;
  // eslint-disable-next-line no-console
  console.log('[MongoDB] connected');

  const { seedDefaultPlans } = require('./seedPlans');
  await seedDefaultPlans();

  const { refreshPlanPriceCache } = require('./planPricing');
  await refreshPlanPriceCache();

  const { seedPaymentMethods } = require('./seedPaymentMethods');
  await seedPaymentMethods();

  const { seedAdminUser } = require('./seedAdminUser');
  await seedAdminUser();

  const { seedSocialPlatforms } = require('./seedSocialPlatforms');
  const SocialPlatform = require('../models/SocialPlatform');
  const socialCount = await SocialPlatform.countDocuments();
  if (socialCount === 0) {
    await seedSocialPlatforms({ verifyLogos: false });
  }
}

function getMongoConnectionLabel() {
  const labels = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return labels[mongoose.connection.readyState] ?? 'unknown';
}

module.exports = { connectDb, mongoose, getMongoConnectionLabel };
