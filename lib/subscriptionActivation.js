const { applySubscriptionActivation, addMonths } = require('./subscriptionLifecycle');
const { intervalToMonths, normalizeInterval } = require('./billingIntervals');

async function activateUserSubscription(userId, options) {
  return applySubscriptionActivation(userId, {
    ...options,
    eventType: options?.eventType,
  });
}

module.exports = {
  activateUserSubscription,
  addMonths,
  intervalToMonths,
  normalizeInterval,
};
