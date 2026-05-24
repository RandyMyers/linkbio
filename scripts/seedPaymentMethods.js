#!/usr/bin/env node
/**
 * Ensure checkout payment method rows exist (bank, crypto, flutterwave, squad, stripe).
 * Safe to run repeatedly — only creates missing rows or fills empty labels.
 */
const { connectDb } = require('../lib/db');
const { seedPaymentMethods } = require('../lib/seedPaymentMethods');
const PaymentMethod = require('../models/PaymentMethod');

async function main() {
  await connectDb();
  await seedPaymentMethods();

  await PaymentMethod.updateOne({ slug: 'stripe', isSystem: true }, { $set: { enabled: true } });
  await PaymentMethod.updateOne({ slug: 'flutterwave', isSystem: true }, { $set: { enabled: true } });

  const methods = await PaymentMethod.find({})
    .sort({ sortOrder: 1, slug: 1 })
    .select('slug label enabled sortOrder isSystem')
    .lean();

  console.log('[seed:payment-methods] Current payment methods:');
  for (const m of methods) {
    console.log(
      `  - ${m.slug}: ${m.enabled ? 'enabled' : 'disabled'} (sort ${m.sortOrder ?? 0})`,
    );
  }
  console.log('[seed:payment-methods] Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed:payment-methods]', err.message || err);
  process.exit(1);
});
