/**
 * Proration & subscription quote tests (no DB).
 * Run: node scripts/testSubscriptionProration.js
 */
const { quoteSubscriptionChange } = require('../lib/subscriptionProration');
const { addMonths, intervalToMonths } = require('../lib/subscriptionActivation');

function mockUser(overrides) {
  return {
    subscriptionPlan: 'pro',
    subscriptionStatus: 'active',
    subscriptionBillingInterval: 'monthly',
    subscriptionPaidThrough: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
    subscriptionPeriodStart: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    cancelAtPeriodEnd: false,
    scheduledPlanSlug: null,
    scheduledChangeAt: null,
    notificationPrefs: {},
    ...overrides,
  };
}

let passed = 0;
let failed = 0;

function assert(name, cond) {
  if (cond) {
    passed += 1;
    console.log(`PASS: ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL: ${name}`);
  }
}

// 1–2: mid-cycle upgrade
const upgrade = quoteSubscriptionChange(mockUser(), {
  planSlug: 'studio',
  interval: 'monthly',
  currency: 'usd',
});
assert('upgrade allowed', upgrade.allowed && upgrade.chargeType === 'upgrade');
assert('upgrade has credit', upgrade.creditAmount > 0);
assert('upgrade amountDue < list', upgrade.amountDue < upgrade.listAmount);

const lastDay = mockUser({
  subscriptionPaidThrough: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
  subscriptionPeriodStart: new Date(Date.now() - 29 * 24 * 60 * 60 * 1000),
});
const upgradeLast = quoteSubscriptionChange(lastDay, {
  planSlug: 'studio',
  interval: 'monthly',
  currency: 'usd',
});
assert('last day upgrade small due', upgradeLast.allowed && upgradeLast.amountDue >= 0);

// 3–4: new / lapsed
const freeUser = mockUser({
  subscriptionPlan: 'free',
  subscriptionPaidThrough: null,
  subscriptionPeriodStart: null,
});
const newPurchase = quoteSubscriptionChange(freeUser, {
  planSlug: 'pro',
  interval: 'monthly',
  currency: 'usd',
});
assert('free to pro is new', newPurchase.chargeType === 'new');
assert('new pays full list', newPurchase.amountDue === newPurchase.listAmount);

const lapsed = mockUser({
  subscriptionPlan: 'pro',
  subscriptionPaidThrough: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
});
const lapsedStudio = quoteSubscriptionChange(lapsed, {
  planSlug: 'studio',
  interval: 'monthly',
  currency: 'usd',
});
assert('lapsed pays full studio', lapsedStudio.chargeType === 'new');

// 5–6: renewal stacking quote
const renewal = quoteSubscriptionChange(mockUser(), {
  planSlug: 'pro',
  interval: 'monthly',
  currency: 'usd',
});
assert('same plan renewal', renewal.chargeType === 'renewal');
assert('renewal extends paidThrough', renewal.paidThroughAfter != null);

// 7–10: downgrade blocked
const blocked = quoteSubscriptionChange(mockUser({ subscriptionPlan: 'studio' }), {
  planSlug: 'pro',
  interval: 'monthly',
  currency: 'usd',
});
assert('downgrade blocked at checkout', !blocked.allowed && blocked.error === 'downgrade_not_allowed');

// interval change on upgrade blocked
const intervalBlock = quoteSubscriptionChange(mockUser(), {
  planSlug: 'studio',
  interval: 'yearly',
  currency: 'usd',
});
assert('interval change on upgrade blocked', !intervalBlock.allowed);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
