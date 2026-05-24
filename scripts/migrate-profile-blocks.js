/**
 * One-time migration: legacy profile fields → composable blocks in customLinks.
 *
 * Run from server folder:
 *   node scripts/migrate-profile-blocks.js
 *   node scripts/migrate-profile-blocks.js --dry-run
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const config = require('../config');
const BioProfile = require('../models/BioProfile');
const { migrateProfileToBlocks, profileNeedsBlockMigration } = require('../lib/migrateProfileBlocks');

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  await mongoose.connect(config.mongoUri);

  const cursor = BioProfile.find({}).cursor();
  let scanned = 0;
  let migrated = 0;
  const summary = [];

  for await (const doc of cursor) {
    scanned += 1;
    if (!profileNeedsBlockMigration(doc)) continue;

    const { profile: next, changed, moves } = migrateProfileToBlocks(doc);
    if (!changed) continue;

    migrated += 1;
    summary.push({ username: doc.username, id: doc._id.toString(), moves });

    if (!dryRun) {
      doc.highlightStats = next.highlightStats;
      doc.ritualSteps = next.ritualSteps;
      doc.pullQuote = next.pullQuote;
      doc.pressLine = next.pressLine;
      doc.customLinks = next.customLinks;
      await doc.save();
    }
  }

  // eslint-disable-next-line no-console
  console.log(dryRun ? '[dry-run] ' : '', `Scanned ${scanned} profiles, migrated ${migrated}.`);
  if (summary.length) {
    // eslint-disable-next-line no-console
    console.table(summary.slice(0, 50));
    if (summary.length > 50) {
      // eslint-disable-next-line no-console
      console.log(`… and ${summary.length - 50} more`);
    }
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
