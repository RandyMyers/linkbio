const { effectiveSubscriptionPlan } = require('./entitlements');

function serializeUser(user, profile) {
  const stored =
    typeof user.subscriptionPlan === 'string' ? user.subscriptionPlan.toLowerCase().trim() : 'free';
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    username: profile?.username || '',
    activeProfileId: user.activeProfileId ? user.activeProfileId.toString() : null,
    role: user.role,
    subscriptionPlan: stored,
    effectivePlan: effectiveSubscriptionPlan(user),
    subscriptionStatus: user.subscriptionStatus || 'none',
    subscriptionPaidThrough: user.subscriptionPaidThrough
      ? new Date(user.subscriptionPaidThrough).toISOString()
      : null,
    subscriptionBillingInterval: user.subscriptionBillingInterval || null,
    cancelAtPeriodEnd: !!user.cancelAtPeriodEnd,
  };
}

module.exports = { serializeUser };
