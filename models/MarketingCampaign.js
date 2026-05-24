const mongoose = require('mongoose');

const marketingCampaignSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    subject: { type: String, default: '', trim: true },
    locale: { type: String, default: '', trim: true, lowercase: true },
    targetLanguages: { type: [String], default: [] },
    targetCountries: { type: [String], default: [] },
    targetConversionStages: { type: [String], default: [] },
    fromName: { type: String, default: '', trim: true },
    replyTo: { type: String, default: '', trim: true },
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'sending', 'sent', 'canceled', 'failed'],
      default: 'draft',
      index: true,
    },
    mailchimpCampaignId: { type: String, default: '', index: true },
    mailchimpListId: { type: String, default: '' },
    mailchimpSegmentId: { type: String, default: null },
    segmentOpts: { type: mongoose.Schema.Types.Mixed, default: null },
    estimatedRecipients: { type: Number, default: null },
    recipientBreakdown: {
      byCountry: { type: mongoose.Schema.Types.Mixed, default: {} },
      byLanguage: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    scheduledAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    htmlContent: { type: String, default: '' },
    plainText: { type: String, default: '' },
    sendChecklist: { type: mongoose.Schema.Types.Mixed, default: null },
    lastReportSyncAt: { type: Date, default: null },
    campaignGroupId: { type: String, default: null },
  },
  { timestamps: true },
);

module.exports =
  mongoose.models.MarketingCampaign || mongoose.model('MarketingCampaign', marketingCampaignSchema);
