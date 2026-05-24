const Lead = require('../models/Lead');
const LeadConversionEvent = require('../models/LeadConversionEvent');
const MarketingCampaign = require('../models/MarketingCampaign');
const { getLeadStats } = require('./leadService');

const DEFAULT_STAGES = ['lead', 'contacted', 'qualified', 'trial', 'paid', 'churned'];

async function getConversionsByCountry() {
  const stats = await getLeadStats();
  return { rows: stats.byCountry || [] };
}

async function getConversionsByLanguage() {
  const stats = await getLeadStats();
  return { rows: stats.byLanguage || [] };
}

async function getFunnel({ country, language } = {}) {
  const match = {};
  if (country) match.country = String(country).toUpperCase();
  if (language) match.language = String(language).toLowerCase();

  const byStage = await Lead.aggregate([
    { $match: match },
    { $group: { _id: '$conversionStage', count: { $sum: 1 } } },
  ]);

  const stageMap = Object.fromEntries(byStage.map((r) => [r._id || 'unknown', r.count]));
  const stages = DEFAULT_STAGES.filter((s) => stageMap[s] != null);
  const extra = Object.keys(stageMap).filter((s) => !DEFAULT_STAGES.includes(s));
  const ordered = [...stages, ...extra];

  return {
    stages: ordered.map((stage) => ({ stage, count: stageMap[stage] || 0 })),
    total: Object.values(stageMap).reduce((a, b) => a + b, 0),
    filters: { country: match.country || null, language: match.language || null },
  };
}

async function getCampaignGeoPerformance(campaignId) {
  const campaign = await MarketingCampaign.findById(campaignId).lean();
  if (!campaign) return null;

  const filter = {
    consentStatus: 'opted_in',
    lastCampaignId: campaign._id,
  };

  const [byCountry, byLanguage, taggedCount] = await Promise.all([
    Lead.aggregate([
      { $match: { ...filter, country: { $ne: '' } } },
      { $group: { _id: '$country', count: { $sum: 1 }, paid: { $sum: { $cond: [{ $eq: ['$conversionStage', 'paid'] }, 1, 0] } } } },
      { $sort: { count: -1 } },
    ]),
    Lead.aggregate([
      { $match: { ...filter, language: { $ne: '' } } },
      { $group: { _id: '$language', count: { $sum: 1 }, paid: { $sum: { $cond: [{ $eq: ['$conversionStage', 'paid'] }, 1, 0] } } } },
      { $sort: { count: -1 } },
    ]),
    Lead.countDocuments(filter),
  ]);

  if (!taggedCount) {
    const targetFilter = { consentStatus: 'opted_in' };
    if (campaign.targetLanguages?.length) {
      targetFilter.language = { $in: campaign.targetLanguages };
    }
    if (campaign.targetCountries?.length) {
      targetFilter.country = { $in: campaign.targetCountries };
    }
    if (campaign.targetConversionStages?.length) {
      targetFilter.conversionStage = { $in: campaign.targetConversionStages };
    }

    const [fallbackCountry, fallbackLanguage, fallbackTotal] = await Promise.all([
      Lead.aggregate([
        { $match: { ...targetFilter, country: { $ne: '' } } },
        { $group: { _id: '$country', count: { $sum: 1 }, paid: { $sum: { $cond: [{ $eq: ['$conversionStage', 'paid'] }, 1, 0] } } } },
        { $sort: { count: -1 } },
      ]),
      Lead.aggregate([
        { $match: { ...targetFilter, language: { $ne: '' } } },
        { $group: { _id: '$language', count: { $sum: 1 }, paid: { $sum: { $cond: [{ $eq: ['$conversionStage', 'paid'] }, 1, 0] } } } },
        { $sort: { count: -1 } },
      ]),
      Lead.countDocuments(targetFilter),
    ]);

    return {
      campaignId: campaign._id.toString(),
      source: 'targeting_estimate',
      audienceTotal: fallbackTotal,
      byCountry: Object.fromEntries(
        fallbackCountry.map((r) => [
          r._id,
          { leads: r.count, paid: r.paid, conversionRate: r.count ? Math.round((r.paid / r.count) * 1000) / 10 : 0 },
        ]),
      ),
      byLanguage: Object.fromEntries(
        fallbackLanguage.map((r) => [
          r._id,
          { leads: r.count, paid: r.paid, conversionRate: r.count ? Math.round((r.paid / r.count) * 1000) / 10 : 0 },
        ]),
      ),
    };
  }

  return {
    campaignId: campaign._id.toString(),
    source: 'last_campaign_attribution',
    audienceTotal: taggedCount,
    byCountry: Object.fromEntries(
      byCountry.map((r) => [
        r._id,
        { leads: r.count, paid: r.paid, conversionRate: r.count ? Math.round((r.paid / r.count) * 1000) / 10 : 0 },
      ]),
    ),
    byLanguage: Object.fromEntries(
      byLanguage.map((r) => [
        r._id,
        { leads: r.count, paid: r.paid, conversionRate: r.count ? Math.round((r.paid / r.count) * 1000) / 10 : 0 },
      ]),
    ),
  };
}

module.exports = {
  getConversionsByCountry,
  getConversionsByLanguage,
  getFunnel,
  getCampaignGeoPerformance,
};
