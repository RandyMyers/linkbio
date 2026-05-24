const MarketingCampaign = require('../models/MarketingCampaign');
const MarketingCampaignReport = require('../models/MarketingCampaignReport');
const { mailchimpRequest } = require('../lib/mailchimpClient');

function serializeReport(doc) {
  if (!doc) return null;
  const d = doc.toObject ? doc.toObject() : doc;
  return {
    id: d._id.toString(),
    campaignId: d.campaignId?.toString(),
    mailchimpCampaignId: d.mailchimpCampaignId || '',
    emailsSent: d.emailsSent || 0,
    opens: d.opens || 0,
    uniqueOpens: d.uniqueOpens || 0,
    clicks: d.clicks || 0,
    unsubscribes: d.unsubscribes || 0,
    bounces: d.bounces || 0,
    openRate: d.openRate || 0,
    clickRate: d.clickRate || 0,
    performanceByCountry: d.performanceByCountry || {},
    performanceByLanguage: d.performanceByLanguage || {},
    fetchedAt: d.fetchedAt ? new Date(d.fetchedAt).toISOString() : null,
  };
}

async function fetchAndCacheReport(campaignId, { refresh = false } = {}) {
  const campaign = await MarketingCampaign.findById(campaignId).lean();
  if (!campaign?.mailchimpCampaignId) return null;

  if (!refresh) {
    const cached = await MarketingCampaignReport.findOne({ campaignId })
      .sort({ fetchedAt: -1 })
      .lean();
    if (cached && Date.now() - new Date(cached.fetchedAt).getTime() < 3600000) {
      return serializeReport(cached);
    }
  }

  let raw;
  try {
    raw = await mailchimpRequest(`/reports/${campaign.mailchimpCampaignId}`);
  } catch (err) {
    if (err.statusCode === 404) return null;
    throw err;
  }

  const emailsSent = raw.emails_sent || 0;
  const opens = raw.opens?.opens_total || 0;
  const uniqueOpens = raw.opens?.unique_opens || 0;
  const clicks = raw.clicks?.clicks_total || 0;
  const unsubscribes = raw.unsubscribed || 0;
  const bounces = (raw.bounces?.hard_bounces || 0) + (raw.bounces?.soft_bounces || 0);
  const openRate = emailsSent ? Math.round((uniqueOpens / emailsSent) * 1000) / 10 : 0;
  const clickRate = emailsSent ? Math.round((clicks / emailsSent) * 1000) / 10 : 0;

  const doc = await MarketingCampaignReport.create({
    campaignId,
    mailchimpCampaignId: campaign.mailchimpCampaignId,
    emailsSent,
    opens,
    uniqueOpens,
    clicks,
    unsubscribes,
    bounces,
    openRate,
    clickRate,
    raw,
    fetchedAt: new Date(),
  });

  await MarketingCampaign.updateOne({ _id: campaignId }, { $set: { lastReportSyncAt: new Date() } });
  if (campaign.status === 'sending' && raw.status === 'sent') {
    await MarketingCampaign.updateOne({ _id: campaignId }, { $set: { status: 'sent' } });
  }

  return serializeReport(doc);
}

module.exports = { serializeReport, fetchAndCacheReport };
