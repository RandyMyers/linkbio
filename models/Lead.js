const mongoose = require('mongoose');
const { subscriberHash } = require('../lib/mailchimpSubscriberHash');

const leadSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    firstName: { type: String, default: '', trim: true },
    lastName: { type: String, default: '', trim: true },
    fullName: { type: String, default: '', trim: true },
    country: { type: String, default: '', trim: true, uppercase: true, index: true },
    language: { type: String, default: '', trim: true, lowercase: true, index: true },
    city: { type: String, default: '', trim: true },
    region: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },
    company: { type: String, default: '', trim: true },
    consentStatus: {
      type: String,
      enum: ['opted_in', 'opted_out', 'pending', 'cleaned', 'unknown'],
      default: 'opted_in',
      index: true,
    },
    consentSource: { type: String, default: 'csv_import', trim: true },
    consentAt: { type: Date, default: null },
    optedOutAt: { type: Date, default: null },
    conversionStage: { type: String, default: 'lead', trim: true, index: true },
    convertedAt: { type: Date, default: null },
    tags: { type: [String], default: [] },
    customFields: { type: mongoose.Schema.Types.Mixed, default: {} },
    importBatchId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeadImportBatch', default: null },
    sourceLabel: { type: String, default: '', trim: true },
    mailchimpListId: { type: String, default: '' },
    mailchimpMemberHash: { type: String, default: '', index: true },
    mailchimpStatus: { type: String, default: '' },
    mailchimpLastSyncAt: { type: Date, default: null },
    mailchimpSyncError: { type: String, default: null },
    lastCampaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'MarketingCampaign', default: null },
  },
  { timestamps: true },
);

leadSchema.index({ email: 1 }, { unique: true });
leadSchema.index({ country: 1, conversionStage: 1 });
leadSchema.index({ language: 1, consentStatus: 1 });

leadSchema.pre('save', function preSave() {
  if (this.email) {
    this.mailchimpMemberHash = subscriberHash(this.email);
  }
});

module.exports = mongoose.models.Lead || mongoose.model('Lead', leadSchema);
