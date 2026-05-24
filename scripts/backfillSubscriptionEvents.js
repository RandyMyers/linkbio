/**
 * Backfill SubscriptionEvent rows from historical payments (idempotent).
 * Run: node scripts/backfillSubscriptionEvents.js
 * Dry run: node scripts/backfillSubscriptionEvents.js --dry-run
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const SubscriptionEvent = require('../models/SubscriptionEvent');
const PaymentRequest = require('../models/PaymentRequest');
const CryptoPayment = require('../models/CryptoPayment');
const GatewayPayment = require('../models/GatewayPayment');
const { addMonths, intervalToMonths } = require('../lib/subscriptionActivation');

const dryRun = process.argv.includes('--dry-run');

async function hasEvent(userId, dedupKey) {
  const n = await SubscriptionEvent.countDocuments({
    userId,
    'metadata.backfillKey': dedupKey,
  });
  return n > 0;
}

async function insertEvent(payload) {
  if (dryRun) return { created: true };
  await SubscriptionEvent.create(payload);
  return { created: true };
}

async function backfillFromBank() {
  const rows = await PaymentRequest.find({ status: 'approved' }).sort({ decidedAt: 1 }).lean();
  let created = 0;
  let skipped = 0;

  for (const row of rows) {
    const key = `bank:${row._id}`;
    if (await hasEvent(row.userId, key)) {
      skipped += 1;
      continue;
    }
    const months = intervalToMonths(row.billingInterval);
    const through = addMonths(row.decidedAt || row.createdAt, months);

    await insertEvent({
      userId: row.userId,
      type: 'activated',
      fromPlan: 'free',
      toPlan: row.requestedPlan,
      billingInterval: row.billingInterval,
      currency: row.currency || 'usd',
      amountCharged: row.amountDue ?? row.listAmount ?? 0,
      creditApplied: row.creditAmount ?? 0,
      paidThroughAfter: through,
      paymentRef: { kind: 'bank', id: row._id.toString() },
      metadata: { backfillKey: key, source: 'backfill' },
    });
    created += 1;
  }

  return { source: 'bank', created, skipped, total: rows.length };
}

async function backfillFromCrypto() {
  const rows = await CryptoPayment.find({
    type: 'subscription',
    paymentStatus: { $in: ['finished', 'confirmed'] },
  })
    .sort({ createdAt: 1 })
    .lean();

  let created = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!row.userId) continue;
    const key = `crypto:${row.orderId}`;
    if (await hasEvent(row.userId, key)) {
      skipped += 1;
      continue;
    }
    const months = intervalToMonths(row.billingInterval);
    const through = addMonths(row.createdAt, months);

    await insertEvent({
      userId: row.userId,
      type: 'activated',
      fromPlan: 'free',
      toPlan: row.planSlug,
      billingInterval: row.billingInterval,
      currency: row.priceCurrency || 'usd',
      amountCharged: row.priceAmount,
      creditApplied: row.creditAmount ?? 0,
      paidThroughAfter: through,
      paymentRef: { kind: 'crypto', id: row.orderId },
      metadata: { backfillKey: key, source: 'backfill' },
    });
    created += 1;
  }

  return { source: 'crypto', created, skipped, total: rows.length };
}

async function backfillFromGateway() {
  const rows = await GatewayPayment.find({
    type: 'subscription',
    paymentStatus: 'successful',
  })
    .sort({ createdAt: 1 })
    .lean();

  let created = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!row.userId) continue;
    const key = `gateway:${row.orderId}`;
    if (await hasEvent(row.userId, key)) {
      skipped += 1;
      continue;
    }
    const months = intervalToMonths(row.billingInterval);
    const through = addMonths(row.createdAt, months);

    await insertEvent({
      userId: row.userId,
      type: row.chargeType === 'upgrade' ? 'upgraded' : 'activated',
      fromPlan: 'free',
      toPlan: row.planSlug,
      billingInterval: row.billingInterval,
      currency: row.priceCurrency || 'usd',
      amountCharged: row.priceAmount,
      creditApplied: row.creditAmount ?? 0,
      paidThroughAfter: through,
      paymentRef: { kind: 'gateway', id: row.orderId },
      metadata: { backfillKey: key, source: 'backfill', provider: row.provider },
    });
    created += 1;
  }

  return { source: 'gateway', created, skipped, total: rows.length };
}

async function backfillPeriodStart() {
  const users = await User.find({
    subscriptionPlan: { $nin: ['', 'free'] },
    subscriptionPaidThrough: { $ne: null },
    subscriptionPeriodStart: null,
  }).select('subscriptionPaidThrough subscriptionBillingInterval');

  let updated = 0;
  for (const user of users) {
    const months = intervalToMonths(user.subscriptionBillingInterval || 'monthly');
    const start = addMonths(user.subscriptionPaidThrough, -months);
    if (!dryRun) {
      user.subscriptionPeriodStart = start;
      await user.save();
    }
    updated += 1;
  }
  return { periodStartUpdated: updated };
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/linkbio');
  // eslint-disable-next-line no-console
  console.log(dryRun ? '[dry-run] backfill subscription events' : '[backfill] subscription events');

  const results = await Promise.all([
    backfillFromBank(),
    backfillFromCrypto(),
    backfillFromGateway(),
    backfillPeriodStart(),
  ]);

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(results, null, 2));
  await mongoose.disconnect();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
