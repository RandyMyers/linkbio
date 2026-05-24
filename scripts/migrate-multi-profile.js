/**
 * One-time migration: allow multiple BioProfile rows per user.
 * Run: node scripts/migrate-multi-profile.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const config = require('../config');
const BioProfile = require('../models/BioProfile');

async function main() {
  await mongoose.connect(config.mongoUri);
  const coll = BioProfile.collection;

  const indexes = await coll.indexes();
  const userIdUnique = indexes.find((i) => i.key?.userId === 1 && i.unique);

  if (userIdUnique) {
    await coll.dropIndex(userIdUnique.name);
    // eslint-disable-next-line no-console
    console.log('Dropped unique index on userId:', userIdUnique.name);
  } else {
    // eslint-disable-next-line no-console
    console.log('No unique userId index found (may already be migrated)');
  }

  await BioProfile.syncIndexes();
  // eslint-disable-next-line no-console
  console.log('Synced BioProfile indexes');

  const result = await BioProfile.updateMany(
    { $or: [{ isDefault: { $exists: false } }, { isDefault: null }] },
    { $set: { isDefault: true, label: '' } },
  );
  // eslint-disable-next-line no-console
  console.log('Marked existing profiles as default:', result.modifiedCount);

  await mongoose.disconnect();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
