#!/usr/bin/env node
/**
 * Seed social platform catalog (Logo.dev domains) into MongoDB.
 * Usage: node scripts/seedSocialPlatforms.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const { connectDb } = require('../lib/db');
const { seedSocialPlatforms } = require('../lib/seedSocialPlatforms');

async function main() {
  await connectDb();
  const result = await seedSocialPlatforms({ verifyLogos: true });
  // eslint-disable-next-line no-console
  console.log('[linkbio/seed] Social platforms:', result);
  await mongoose.disconnect();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
