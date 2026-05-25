/**
 * Inspect subscription + payment records for a user (by email, username, or name fragment).
 * Usage: node scripts/inspectUserSubscription.js ryan
 *        node scripts/inspectUserSubscription.js --repair ryan
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const User = require('../models/User');
const GatewayPayment = require('../models/GatewayPayment');
const CryptoPayment = require('../models/CryptoPayment');
const PaymentRequest = require('../models/PaymentRequest');
const SubscriptionEvent = require('../models/SubscriptionEvent');
const { getSubscriptionState } = require('../lib/subscriptionLifecycle');
const { entitlementLimits } = require('../lib/entitlements');
const { fulfillGatewayPayment } = require('../services/gatewayPaymentFulfillment');
const { retrieveCheckoutSession } = require('../lib/stripeClient');
const { resolveGatewayConfig } = require('../services/gatewayConfig');
const { sessionMatchesRecord } = require('../services/stripeBilling');

async function findUser(query) {
  const q = String(query || '').trim();
  const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  return User.findOne({
    $or: [{ email: rx }, { username: rx }, { name: rx }],
  }).lean();
}

function printSection(title, data) {
  console.log(`\n=== ${title} ===`);
  console.log(JSON.stringify(data, null, 2));
}

async function tryRepairStripePayment(record) {
  if (!record || record.provider !== 'stripe' || record.paymentStatus === 'successful') {
    return { skipped: true, reason: 'not_stripe_or_already_successful' };
  }

  const cfg = await resolveGatewayConfig('stripe');
  if (!cfg?.secretKey) {
    return { skipped: true, reason: 'stripe_not_configured' };
  }

  const sessionId =
    record.providerReference || record.meta?.sessionId || record.meta?.lastSession?.id || '';
  if (!sessionId) {
    return { skipped: true, reason: 'no_session_id' };
  }

  const session = await retrieveCheckoutSession(cfg.secretKey, sessionId);
  if (session.payment_status !== 'paid') {
    return { skipped: true, reason: `session_not_paid:${session.payment_status}` };
  }
  if (!sessionMatchesRecord(session, record)) {
    return { skipped: true, reason: 'session_mismatch' };
  }

  const fresh = await GatewayPayment.findById(record._id);
  const result = await fulfillGatewayPayment(fresh, {
    status: 'successful',
    providerReference: session.id,
    metaPatch: { repairedBy: 'inspectUserSubscription.js', lastSession: { id: session.id } },
  });
  return { repaired: true, result };
}

async function main() {
  const args = process.argv.slice(2);
  const repair = args.includes('--repair');
  const query = args.filter((a) => a !== '--repair')[0] || 'ryan';

  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI missing');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const user = await findUser(query);
  if (!user) {
    console.error(`No user matching "${query}"`);
    process.exit(1);
  }

  const state = getSubscriptionState(user);
  const { effectivePlan, storedPlan } = await entitlementLimits(user);

  printSection('User', {
    id: user._id.toString(),
    email: user.email,
    username: user.username,
    name: user.name,
    subscriptionPlan: user.subscriptionPlan,
    subscriptionStatus: user.subscriptionStatus,
    subscriptionPaidThrough: user.subscriptionPaidThrough,
    subscriptionBillingInterval: user.subscriptionBillingInterval,
    subscriptionPeriodStart: user.subscriptionPeriodStart,
    cancelAtPeriodEnd: user.cancelAtPeriodEnd,
    scheduledPlanSlug: user.scheduledPlanSlug,
  });

  printSection('Computed state', { ...state, effectivePlan, storedPlan });

  const userId = user._id;
  const [gateway, crypto, bank, events] = await Promise.all([
    GatewayPayment.find({ userId }).sort({ createdAt: -1 }).limit(10).lean(),
    CryptoPayment.find({ userId }).sort({ createdAt: -1 }).limit(10).lean(),
    PaymentRequest.find({ userId }).sort({ createdAt: -1 }).limit(10).lean(),
    SubscriptionEvent.find({ userId }).sort({ createdAt: -1 }).limit(10).lean(),
  ]);

  printSection('Gateway payments', gateway);
  printSection('Crypto payments', crypto);
  printSection('Bank requests', bank);
  printSection('Subscription events', events);

  if (repair) {
    const pendingStripe = await GatewayPayment.findOne({
      userId,
      provider: 'stripe',
      type: 'subscription',
      paymentStatus: { $ne: 'successful' },
    }).sort({ createdAt: -1 });

    if (pendingStripe) {
      const repairResult = await tryRepairStripePayment(pendingStripe);
      printSection('Repair attempt (latest pending Stripe)', repairResult);

      const updatedUser = await User.findById(userId).lean();
      const updatedState = getSubscriptionState(updatedUser);
      const updatedEnt = await entitlementLimits(updatedUser);
      printSection('User after repair', {
        subscriptionPlan: updatedUser.subscriptionPlan,
        subscriptionStatus: updatedUser.subscriptionStatus,
        subscriptionPaidThrough: updatedUser.subscriptionPaidThrough,
        effectivePlan: updatedEnt.effectivePlan,
        ...updatedState,
      });
    } else {
      printSection('Repair', { skipped: true, reason: 'no_pending_stripe_subscription_payment' });
    }
  } else {
    console.log('\nRun with --repair to fulfill latest pending Stripe payment if session is paid.');
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
