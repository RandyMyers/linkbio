/**
 * Plan entitlements — enforced via lib/entitlements.js.
 * Paid tiers activate via bank transfer approval or NOWPayments IPN.
 */
module.exports = {
  free: {
    label: 'Free',
    maxProfiles: 1,
    maxBlocks: 50,
    customDomains: 0,
    advancedAnalytics: false,
    premiumThemes: false,
    hideWatermarkAllowed: false,
    commercePlatformFeePercent: 5,
    teamWorkspaces: false,
    apiAccess: false,
  },
  pro: {
    label: 'Pro',
    maxProfiles: 1,
    maxBlocks: 50,
    customDomains: 1,
    advancedAnalytics: true,
    premiumThemes: true,
    hideWatermarkAllowed: true,
    commercePlatformFeePercent: 0,
    teamWorkspaces: false,
    apiAccess: false,
  },
  studio: {
    label: 'Studio',
    maxProfiles: 50,
    maxBlocks: 50,
    customDomains: 10,
    advancedAnalytics: true,
    premiumThemes: true,
    hideWatermarkAllowed: true,
    commercePlatformFeePercent: 0,
    teamWorkspaces: true,
    apiAccess: true,
  },
};
