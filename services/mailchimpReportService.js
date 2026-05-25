const MarketingCampaign = require('../models/MarketingCampaign');
const MarketingCampaignReport = require('../models/MarketingCampaignReport');
const { mailchimpRequest } = require('../lib/mailchimpClient');
const { getCampaignGeoPerformance } = require('./leadAnalyticsService');

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

  let geo = { byCountry: {}, byLanguage: {} };
  try {
    const geoPerf = await getCampaignGeoPerformance(campaignId);
    if (geoPerf) {
      geo = { byCountry: geoPerf.byCountry, byLanguage: geoPerf.byLanguage };
    }
  } catch {
    /* optional enrichment */
  }

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
    performanceByCountry: geo.byCountry,
    performanceByLanguage: geo.byLanguage,
    raw,
    fetchedAt: new Date(),
  });

  await MarketingCampaign.updateOne({ _id: campaignId }, { $set: { lastReportSyncAt: new Date() } });
  if (campaign.status === 'sending' && raw.status === 'sent') {
    await MarketingCampaign.updateOne({ _id: campaignId }, { $set: { status: 'sent' } });
  }

  return serializeReport(doc);
}

async function getReportOpenDetails(campaignId) {
  const campaign = await MarketingCampaign.findById(campaignId).lean();
  if (!campaign?.mailchimpCampaignId) return null;
  try {
    const data = await mailchimpRequest(`/reports/${campaign.mailchimpCampaignId}/open-details`);
    const opens = (data.members || []).map((m) => ({
      email: m.email_address,
      opens: m.opens_count ?? 1,
      openTime: m.open_timestamp || m.last_open || null,
    }));
    return { opens, total: data.total_items ?? opens.length };
  } catch (err) {
    if (err.statusCode === 404) return { opens: [], total: 0 };
    throw err;
  }
}

async function getCampaignPerformanceSummary({ limit = 10 } = {}) {
  const campaigns = await MarketingCampaign.find({ status: { $in: ['sent', 'sending'] } })
    .sort({ sentAt: -1 })
    .limit(Math.min(20, Number(limit) || 10))
    .lean();
  const reports = await MarketingCampaignReport.find({
    campaignId: { $in: campaigns.map((c) => c._id) },
  })
    .sort({ fetchedAt: -1 })
    .lean();

  const byCampaign = new Map();
  for (const r of reports) {
    const cid = r.campaignId?.toString();
    if (!cid || byCampaign.has(cid)) continue;
    byCampaign.set(cid, r);
  }

  return {
    campaigns: campaigns.map((c) => {
      const r = byCampaign.get(c._id.toString());
      return {
        id: c._id.toString(),
        title: c.title,
        status: c.status,
        sentAt: c.sentAt ? new Date(c.sentAt).toISOString() : null,
        emailsSent: r?.emailsSent ?? c.estimatedRecipients ?? 0,
        openRate: r?.openRate ?? 0,
        clickRate: r?.clickRate ?? 0,
        unsubscribes: r?.unsubscribes ?? 0,
      };
    }),
  };
}

module.exports = {
  serializeReport,
  fetchAndCacheReport,
  getReportOpenDetails,
  getCampaignPerformanceSummary,
};
