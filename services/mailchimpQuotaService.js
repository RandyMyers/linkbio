const Lead = require('../models/Lead');
const PlatformSettings = require('../models/PlatformSettings');
const { mailchimpRequest } = require('../lib/mailchimpClient');
const { getMailchimpSettings } = require('../lib/mailchimpSettings');

async function getContactQuota() {
  const doc = await PlatformSettings.findById('global').lean();
  const mc = doc?.mailchimp || {};
  const used = await Lead.countDocuments({ consentStatus: { $in: ['opted_in', 'pending'] } });
  const limit = Number(mc.contactLimit) || 0;
  return {
    used,
    limit,
    headroom: limit > 0 ? Math.max(0, limit - used) : null,
    pct: limit > 0 ? Math.round((used / limit) * 1000) / 10 : null,
  };
}

function buildLeadFilter({ targetLanguages, targetCountries, targetConversionStages } = {}) {
  const filter = { consentStatus: 'opted_in' };
  if (targetLanguages?.length) {
    filter.language = { $in: targetLanguages.map((l) => String(l).toLowerCase()) };
  }
  if (targetCountries?.length) {
    filter.country = { $in: targetCountries.map((c) => String(c).toUpperCase()) };
  }
  if (targetConversionStages?.length) {
    filter.conversionStage = { $in: targetConversionStages.map(String) };
  }
  return filter;
}

async function estimateRecipients(targets = {}) {
  const filter = buildLeadFilter(targets);
  const total = await Lead.countDocuments(filter);

  const [byCountry, byLanguage] = await Promise.all([
    Lead.aggregate([
      { $match: filter },
      { $match: { country: { $ne: '' } } },
      { $group: { _id: '$country', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Lead.aggregate([
      { $match: filter },
      { $match: { language: { $ne: '' } } },
      { $group: { _id: '$language', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
  ]);

  return {
    total,
    byCountry: Object.fromEntries(byCountry.map((r) => [r._id, r.count])),
    byLanguage: Object.fromEntries(byLanguage.map((r) => [r._id, r.count])),
  };
}

async function assertSendAllowed(estimatedRecipients) {
  const quota = await getContactQuota();
  if (quota.limit > 0 && estimatedRecipients > quota.headroom) {
    const err = new Error(
      `Send would exceed contact limit (${quota.used + estimatedRecipients} / ${quota.limit}).`,
    );
    err.statusCode = 400;
    err.code = 'CONTACT_LIMIT_EXCEEDED';
    err.quota = quota;
    throw err;
  }
  if (estimatedRecipients <= 0) {
    const err = new Error('No opted-in recipients match this campaign targeting.');
    err.statusCode = 400;
    err.code = 'NO_RECIPIENTS';
    throw err;
  }
  return quota;
}

async function fetchListStats() {
  const settings = await getMailchimpSettings();
  if (!settings.defaultListId) return null;
  try {
    const list = await mailchimpRequest(
      `/lists/${settings.defaultListId}?include_total_contacts=true`,
    );
    return {
      memberCount: list.stats?.member_count ?? 0,
      totalContacts: list.stats?.total_contacts ?? 0,
      unsubscribeCount: list.stats?.unsubscribe_count ?? 0,
      cleanedCount: list.stats?.cleaned_count ?? 0,
    };
  } catch {
    return null;
  }
}

module.exports = {
  getContactQuota,
  buildLeadFilter,
  estimateRecipients,
  assertSendAllowed,
  fetchListStats,
};
