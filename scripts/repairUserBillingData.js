/**
 * Repair user subscription state from successful payments and backfill subscription events.
 *
 * Usage:
 *   node scripts/repairUserBillingData.js              # all users with payments
 *   node scripts/repairUserBillingData.js user@mail.com
 *   node scripts/repairUserBillingData.js --dry-run
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const User = require('../models/User');
const GatewayPayment = require('../models/GatewayPayment');
const CryptoPayment = require('../models/CryptoPayment');
const PaymentRequest = require('../models/PaymentRequest');
const { fulfillGatewayPayment } = require('../services/gatewayPaymentFulfillment');
const { activateUserSubscription, addMonths, intervalToMonths } = require('../lib/subscriptionActivation');
const { getSubscriptionState } = require('../lib/subscriptionLifecycle');
const { retrieveCheckoutSession } = require('../lib/stripeClient');
const { resolveGatewayConfig } = require('../services/gatewayConfig');
const { sessionMatchesRecord } = require('../services/stripeBilling');

const dryRun = process.argv.includes('--dry-run');
const emailArg = process.argv.find((a) => a.includes('@'));

async function tryFulfillStripe(record) {
  if (!record || record.provider !== 'stripe' || record.paymentStatus === 'successful') {
    return { skipped: true };
  }
  const cfg = await resolveGatewayConfig('stripe');
  if (!cfg?.secretKey) return { skipped: true, reason: 'stripe_not_configured' };

  const sessionId =
    record.providerReference || record.meta?.sessionId || record.meta?.lastSession?.id || '';
  if (!sessionId) return { skipped: true, reason: 'no_session_id' };

  const session = await retrieveCheckoutSession(cfg.secretKey, sessionId);
  if (session.payment_status !== 'paid') {
    return { skipped: true, reason: `session_${session.payment_status}` };
  }
  if (!sessionMatchesRecord(session, record)) {
    return { skipped: true, reason: 'session_mismatch' };
  }

  if (dryRun) return { wouldFulfill: true, orderId: record.orderId };

  const fresh = await GatewayPayment.findById(record._id);
  return fulfillGatewayPayment(fresh, {
    status: 'successful',
    providerReference: session.id,
    metaPatch: { repairedBy: 'repairUserBillingData.js' },
  });
}

async function activateFromApprovedBank(row) {
  if (dryRun) {
    return { wouldActivate: true, source: 'bank', id: row._id.toString() };
  }
  const months = intervalToMonths(row.billingInterval);
  const through = addMonths(row.decidedAt || row.createdAt, months);
  await activateUserSubscription(row.userId, {
    planSlug: row.requestedPlan,
    billingInterval: row.billingInterval,
    paidThrough: through,
    amountCharged: row.amountDue ?? row.listAmount ?? 0,
    creditApplied: row.creditAmount ?? 0,
    paymentRef: { kind: 'bank', id: row._id.toString() },
    metadata: { repairedBy: 'repairUserBillingData.js', backfillKey: `bank:${row._id}` },
  });
  return { activated: true, source: 'bank' };
}

async function activateFromCrypto(row) {
  if (!['finished', 'confirmed'].includes(String(row.paymentStatus).toLowerCase())) {
    return { skipped: true };
  }
  if (dryRun) {
    return { wouldActivate: true, source: 'crypto', orderId: row.orderId };
  }
  const months = intervalToMonths(row.billingInterval);
  const through = addMonths(row.createdAt, months);
  await activateUserSubscription(row.userId, {
    planSlug: row.planSlug,
    billingInterval: row.billingInterval,
    paidThrough: through,
    amountCharged: row.priceAmount,
    creditApplied: row.creditAmount ?? 0,
    paymentRef: { kind: 'crypto', id: row.orderId },
    metadata: { repairedBy: 'repairUserBillingData.js', backfillKey: `crypto:${row.orderId}` },
  });
  return { activated: true, source: 'crypto' };
}

async function repairUser(userId) {
  const user = await User.findById(userId);
  if (!user) return { error: 'user_not_found' };

  const summary = { userId: userId.toString(), email: user.email, actions: [] };
  const stateBefore = getSubscriptionState(user);

  const [gateways, cryptos, banks] = await Promise.all([
    GatewayPayment.find({ userId, type: 'subscription' }).sort({ updatedAt: -1 }).lean(),
    CryptoPayment.find({
      userId,
      type: 'subscription',
      paymentStatus: { $in: ['finished', 'confirmed'] },
    })
      .sort({ createdAt: -1 })
      .lean(),
    PaymentRequest.find({ userId, status: 'approved' }).sort({ decidedAt: -1 }).lean(),
  ]);

  for (const g of gateways) {
    if (g.provider === 'stripe' && g.paymentStatus !== 'successful') {
      const r = await tryFulfillStripe(g);
      if (!r.skipped) summary.actions.push({ stripeFulfill: g.orderId, ...r });
    } else if (g.paymentStatus === 'successful' && stateBefore.effectivePlan === 'free') {
      if (dryRun) {
        summary.actions.push({ wouldActivateFromGateway: g.orderId });
      } else {
        const fresh = await GatewayPayment.findOne({ orderId: g.orderId });
        const r = await fulfillGatewayPayment(fresh, { status: 'successful' });
        summary.actions.push({ gatewayReactivate: g.orderId, ...r });
      }
    }
  }

  const userAfterGateway = await User.findById(userId);
  const stateMid = getSubscriptionState(userAfterGateway);

  if (stateMid.effectivePlan === 'free' && cryptos[0]) {
    const r = await activateFromCrypto(cryptos[0]);
    summary.actions.push(r);
  }

  const userAfterCrypto = await User.findById(userId);
  const stateMid2 = getSubscriptionState(userAfterCrypto);

  if (stateMid2.effectivePlan === 'free' && banks[0]) {
    const r = await activateFromApprovedBank(banks[0]);
    summary.actions.push(r);
  }

  if (!user.subscriptionPeriodStart && user.subscriptionPaidThrough && user.subscriptionBillingInterval) {
    const months = intervalToMonths(user.subscriptionBillingInterval);
    const start = addMonths(user.subscriptionPaidThrough, -months);
    if (!dryRun) {
      user.subscriptionPeriodStart = start;
      await user.save();
    }
    summary.actions.push({ periodStartSet: dryRun ? 'dry' : start.toISOString() });
  }

  const finalUser = await User.findById(userId);
  summary.after = getSubscriptionState(finalUser);

  return summary;
}

async function collectUserIds() {
  if (emailArg) {
    const u = await User.findOne({ email: emailArg.toLowerCase().trim() });
    return u ? [u._id] : [];
  }

  const ids = new Set();
  const [g, c, b] = await Promise.all([
    GatewayPayment.distinct('userId', { userId: { $ne: null }, type: 'subscription' }),
    CryptoPayment.distinct('userId', {
      userId: { $ne: null },
      type: 'subscription',
      paymentStatus: { $in: ['finished', 'confirmed'] },
    }),
    PaymentRequest.distinct('userId', { status: 'approved' }),
  ]);
  for (const id of [...g, ...c, ...b]) {
    if (id) ids.add(String(id));
  }
  return [...ids].map((id) => new mongoose.Types.ObjectId(id));
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI missing');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log(dryRun ? '[dry-run] repair user billing' : '[repair] user billing');

  const userIds = await collectUserIds();
  if (!userIds.length) {
    console.log('No users to repair');
    await mongoose.disconnect();
    return;
  }

  const results = [];
  for (const uid of userIds) {
    results.push(await repairUser(uid));
  }

  console.log(JSON.stringify(results, null, 2));

  if (!dryRun) {
    const { execSync } = require('child_process');
    console.log('\nRunning subscription event backfill…');
    execSync('node scripts/backfillSubscriptionEvents.js', {
      cwd: require('path').join(__dirname, '..'),
      stdio: 'inherit',
    });
  } else {
    console.log('\n[dry-run] Skipping backfillSubscriptionEvents.js');
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
