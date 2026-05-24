const mongoose = require('mongoose');

const marketingCampaignReportSchema = new mongoose.Schema(
  {
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'MarketingCampaign', required: true, index: true },
    mailchimpCampaignId: { type: String, default: '' },
    emailsSent: { type: Number, default: 0 },
    opens: { type: Number, default: 0 },
    uniqueOpens: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    unsubscribes: { type: Number, default: 0 },
    bounces: { type: Number, default: 0 },
    openRate: { type: Number, default: 0 },
    clickRate: { type: Number, default: 0 },
    performanceByCountry: { type: mongoose.Schema.Types.Mixed, default: {} },
    performanceByLanguage: { type: mongoose.Schema.Types.Mixed, default: {} },
    fetchedAt: { type: Date, default: Date.now },
    raw: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

module.exports =
  mongoose.models.MarketingCampaignReport ||
  mongoose.model('MarketingCampaignReport', marketingCampaignReportSchema);
