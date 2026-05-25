const mongoose = require('mongoose');

const platformSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'global' },
    billingEnabled: { type: Boolean, default: true },
    defaultCurrency: { type: String, default: 'usd', lowercase: true, trim: true },
    supportedCurrencies: {
      type: [String],
      default: () => ['usd', 'eur', 'gbp'],
    },
    supportedIntervals: {
      type: [String],
      default: () => ['monthly', 'quarterly', 'yearly'],
    },
    maintenanceMessage: { type: String, default: '', trim: true },
    /** Which stored credential environment checkout/billing uses */
    gatewayRuntimeMode: {
      type: String,
      enum: ['sandbox', 'production'],
      default: 'sandbox',
    },
    /** Days of paid access after subscriptionPaidThrough (0 = none) */
    subscriptionGraceDays: { type: Number, default: 0, min: 0, max: 30 },
    mailchimp: {
      enabled: { type: Boolean, default: false },
      apiKeyEncrypted: { type: String, default: '' },
      apiKeyIv: { type: String, default: '' },
      apiKeyAuthTag: { type: String, default: '' },
      apiKeyLast4: { type: String, default: '' },
      serverPrefix: { type: String, default: '', trim: true },
      defaultListId: { type: String, default: '', trim: true },
      fromName: { type: String, default: '', trim: true },
      fromEmail: { type: String, default: '', trim: true },
      replyTo: { type: String, default: '', trim: true },
      doubleOptIn: { type: Boolean, default: false },
      contactLimit: { type: Number, default: 0, min: 0 },
      webhookSecret: { type: String, default: '', trim: true },
      mergeFieldsProvisioned: { type: Boolean, default: false },
      conversionStages: {
        type: [String],
        default: () => ['lead', 'contacted', 'qualified', 'trial', 'paid', 'churned'],
      },
      supportedLanguages: {
        type: [String],
        default: () => ['en', 'fr', 'es', 'de', 'pt'],
      },
      lastHealthCheckAt: { type: Date, default: null },
      /** Create/update Lead when a creator signs up */
      autoSyncSignups: { type: Boolean, default: false },
      /** Create/update Lead when someone subscribes via newsletter block */
      autoSyncSubscribers: { type: Boolean, default: false },
      /** Mark lead paid when creator subscribes to a paid LinkBio plan */
      autoSyncPaidSubscribers: { type: Boolean, default: false },
      cachedListStats: {
        memberCount: { type: Number, default: 0 },
        totalContacts: { type: Number, default: 0 },
        fetchedAt: { type: Date, default: null },
      },
    },
    updatedBy: { type: String, default: '', trim: true },
  },
  { timestamps: true },
);

module.exports =
  mongoose.models.PlatformSettings || mongoose.model('PlatformSettings', platformSettingsSchema);
