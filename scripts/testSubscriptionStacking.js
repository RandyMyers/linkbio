/**
 * Quick check: renewal extends from paidThrough, not from now.
 * Run: node scripts/testSubscriptionStacking.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const { applySubscriptionActivation, addMonths } = require('../lib/subscriptionLifecycle');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/linkbio');
  const email = `stack-test-${Date.now()}@example.com`;
  const user = await User.create({
    email,
    passwordHash: await User.hashPassword('testpass123'),
    name: 'Stack Test',
  });

  const future = addMonths(new Date(), 1);
  user.subscriptionPaidThrough = future;
  user.subscriptionPlan = 'pro';
  user.subscriptionStatus = 'active';
  user.subscriptionBillingInterval = 'monthly';
  await user.save();

  await applySubscriptionActivation(user._id, {
    planSlug: 'pro',
    billingInterval: 'monthly',
    eventType: 'renewed',
  });

  const updated = await User.findById(user._id);
  const expectedMin = addMonths(future, 1).getTime() - 5000;
  const ok = updated.subscriptionPaidThrough.getTime() >= expectedMin;

  // eslint-disable-next-line no-console
  console.log(ok ? 'PASS: paidThrough stacked from prior end' : 'FAIL: paidThrough did not stack');
  // eslint-disable-next-line no-console
  console.log('  before:', future.toISOString());
  // eslint-disable-next-line no-console
  console.log('  after:', updated.subscriptionPaidThrough.toISOString());

  await User.deleteOne({ _id: user._id });
  await mongoose.disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
