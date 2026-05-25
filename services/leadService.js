const Lead = require('../models/Lead');
const LeadConversionEvent = require('../models/LeadConversionEvent');
const { subscriberHash } = require('../lib/mailchimpSubscriberHash');
const { deleteMemberPermanent } = require('./mailchimpMemberSync');
const { mailchimpRequest } = require('../lib/mailchimpClient');
const { getMailchimpSettings } = require('../lib/mailchimpSettings');
const MarketingCampaign = require('../models/MarketingCampaign');

function serializeLead(doc) {
  if (!doc) return null;
  const d = doc.toObject ? doc.toObject() : doc;
  return {
    id: d._id.toString(),
    email: d.email,
    firstName: d.firstName || '',
    lastName: d.lastName || '',
    fullName: d.fullName || '',
    country: d.country || '',
    language: d.language || '',
    city: d.city || '',
    region: d.region || '',
    phone: d.phone || '',
    company: d.company || '',
    consentStatus: d.consentStatus,
    consentSource: d.consentSource || '',
    consentAt: d.consentAt ? new Date(d.consentAt).toISOString() : null,
    optedOutAt: d.optedOutAt ? new Date(d.optedOutAt).toISOString() : null,
    conversionStage: d.conversionStage || 'lead',
    convertedAt: d.convertedAt ? new Date(d.convertedAt).toISOString() : null,
    tags: d.tags || [],
    customFields: d.customFields || {},
    sourceLabel: d.sourceLabel || '',
    importBatchId: d.importBatchId ? d.importBatchId.toString() : null,
    mailchimpStatus: d.mailchimpStatus || '',
    mailchimpLastSyncAt: d.mailchimpLastSyncAt ? new Date(d.mailchimpLastSyncAt).toISOString() : null,
    mailchimpSyncError: d.mailchimpSyncError || null,
    lastCampaignId: d.lastCampaignId ? d.lastCampaignId.toString() : null,
    createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : null,
    updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : null,
  };
}

async function recordConversionEvent(leadId, { fromStage, toStage, source, metadata }) {
  if (fromStage === toStage) return;
  await LeadConversionEvent.create({
    leadId,
    fromStage: fromStage || '',
    toStage,
    source: source || 'admin',
    metadata: metadata || {},
  });
}

async function listLeads({
  page = 1,
  limit = 50,
  country,
  language,
  consentStatus,
  conversionStage,
  importBatchId,
  tag,
  q,
} = {}) {
  const cap = Math.min(200, Math.max(1, Number(limit) || 50));
  const skip = (Math.max(1, Number(page) || 1) - 1) * cap;
  const filter = buildLeadFilter({
    country,
    language,
    consentStatus,
    conversionStage,
    importBatchId,
    tag,
    q,
  });
  const [rows, total] = await Promise.all([
    Lead.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(cap).lean(),
    Lead.countDocuments(filter),
  ]);
  return { leads: rows.map(serializeLead), total, page: Math.max(1, Number(page) || 1), limit: cap };
}

async function getLeadCampaignActivity(lead) {
  const settings = await getMailchimpSettings();
  const activity = [];
  const campaigns = await MarketingCampaign.find({
    status: { $in: ['sent', 'sending'] },
    ...(lead.lastCampaignId ? { _id: lead.lastCampaignId } : {}),
  })
    .sort({ sentAt: -1 })
    .limit(10)
    .lean();

  for (const c of campaigns) {
    activity.push({
      campaignId: c._id.toString(),
      title: c.title,
      sentAt: c.sentAt ? new Date(c.sentAt).toISOString() : null,
      tag: `campaign:${c._id}`,
      included: (lead.tags || []).includes(`campaign:${c._id}`),
    });
  }

  if (settings.enabled && settings.defaultListId && lead.email) {
    try {
      const hash = subscriberHash(lead.email);
      const mc = await mailchimpRequest(
        `/lists/${settings.defaultListId}/members/${hash}/activity`,
      );
      for (const row of (mc.activity || []).slice(0, 20)) {
        activity.push({
          type: row.activity_type || row.action,
          title: row.campaign_title || row.title || row.email_type || 'Mailchimp',
          at: row.created_at_timestamp
            ? new Date(row.created_at_timestamp).toISOString()
            : row.timestamp
              ? new Date(row.timestamp).toISOString()
              : null,
          source: 'mailchimp',
        });
      }
    } catch {
      /* member activity optional */
    }
  }

  return activity;
}

async function getLeadDetail(id) {
  const lead = await Lead.findById(id).lean();
  if (!lead) return null;
  const events = await LeadConversionEvent.find({ leadId: lead._id })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  const campaignActivity = await getLeadCampaignActivity(lead);
  return {
    lead: serializeLead(lead),
    conversionTimeline: events.map((e) => ({
      id: e._id.toString(),
      fromStage: e.fromStage || '',
      toStage: e.toStage,
      source: e.source,
      at: e.createdAt ? new Date(e.createdAt).toISOString() : null,
    })),
    campaignActivity,
  };
}

async function archiveLead(id) {
  const lead = await Lead.findById(id);
  if (!lead) return null;
  lead.consentStatus = 'opted_out';
  lead.optedOutAt = new Date();
  lead.tags = [...new Set([...(lead.tags || []), 'archived'])];
  await lead.save();
  return serializeLead(lead);
}

async function getLeadStats() {
  const [totals, byCountry, byLanguage, byStage, byConsent] = await Promise.all([
    Lead.countDocuments({}),
    Lead.aggregate([
      { $match: { country: { $ne: '' } } },
      { $group: { _id: '$country', count: { $sum: 1 }, paid: { $sum: { $cond: [{ $eq: ['$conversionStage', 'paid'] }, 1, 0] } } } },
      { $sort: { count: -1 } },
      { $limit: 50 },
    ]),
    Lead.aggregate([
      { $match: { language: { $ne: '' } } },
      { $group: { _id: '$language', count: { $sum: 1 }, paid: { $sum: { $cond: [{ $eq: ['$conversionStage', 'paid'] }, 1, 0] } } } },
      { $sort: { count: -1 } },
      { $limit: 50 },
    ]),
    Lead.aggregate([{ $group: { _id: '$conversionStage', count: { $sum: 1 } } }]),
    Lead.aggregate([{ $group: { _id: '$consentStatus', count: { $sum: 1 } } }]),
  ]);
  return {
    total: totals,
    byCountry: byCountry.map((r) => ({
      country: r._id,
      count: r.count,
      paid: r.paid,
      conversionRate: r.count ? Math.round((r.paid / r.count) * 1000) / 10 : 0,
    })),
    byLanguage: byLanguage.map((r) => ({
      language: r._id,
      count: r.count,
      paid: r.paid,
      conversionRate: r.count ? Math.round((r.paid / r.count) * 1000) / 10 : 0,
    })),
    byStage: Object.fromEntries(byStage.map((r) => [r._id || 'unknown', r.count])),
    byConsent: Object.fromEntries(byConsent.map((r) => [r._id || 'unknown', r.count])),
  };
}

async function updateLead(id, patch, { source = 'admin' } = {}) {
  const lead = await Lead.findById(id);
  if (!lead) return null;
  const beforeStage = lead.conversionStage;
  const allowed = [
    'firstName', 'lastName', 'fullName', 'country', 'language', 'city', 'region',
    'phone', 'company', 'consentStatus', 'conversionStage', 'tags', 'sourceLabel', 'customFields',
  ];
  for (const key of allowed) {
    if (patch[key] !== undefined) {
      if (key === 'country' && patch[key]) lead.country = String(patch[key]).toUpperCase().slice(0, 2);
      else if (key === 'language' && patch[key]) lead.language = String(patch[key]).toLowerCase().slice(0, 2);
      else lead[key] = patch[key];
    }
  }
  if (patch.consentStatus === 'opted_out') lead.optedOutAt = new Date();
  if (patch.conversionStage === 'paid' && !lead.convertedAt) lead.convertedAt = new Date();
  lead.mailchimpMemberHash = subscriberHash(lead.email);
  await lead.save();
  if (patch.conversionStage && patch.conversionStage !== beforeStage) {
    await recordConversionEvent(lead._id, {
      fromStage: beforeStage,
      toStage: patch.conversionStage,
      source,
    });
  }
  return serializeLead(lead);
}

function buildLeadFilter({
  country,
  language,
  consentStatus,
  conversionStage,
  importBatchId,
  tag,
  q,
} = {}) {
  const filter = {};
  if (country) filter.country = String(country).toUpperCase();
  if (language) filter.language = String(language).toLowerCase();
  if (consentStatus) filter.consentStatus = consentStatus;
  if (conversionStage) filter.conversionStage = conversionStage;
  if (importBatchId) filter.importBatchId = importBatchId;
  if (tag) filter.tags = String(tag).trim();
  if (q) {
    const rx = new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ email: rx }, { firstName: rx }, { lastName: rx }, { company: rx }];
  }
  return filter;
}

async function deleteLeadPermanent(id) {
  const lead = await Lead.findById(id);
  if (!lead) return null;
  const emailBefore = lead.email;
  try {
    await deleteMemberPermanent(emailBefore);
  } catch {
    /* proceed with local anonymization */
  }
  const anonId = lead._id.toString().slice(-8);
  lead.email = `deleted-${anonId}@anonymized.linkbio`;
  lead.firstName = '';
  lead.lastName = '';
  lead.fullName = '';
  lead.phone = '';
  lead.company = '';
  lead.country = '';
  lead.language = '';
  lead.city = '';
  lead.region = '';
  lead.tags = ['gdpr_deleted'];
  lead.customFields = {};
  lead.consentStatus = 'opted_out';
  lead.conversionStage = 'churned';
  lead.sourceLabel = 'gdpr_erasure';
  lead.optedOutAt = new Date();
  lead.mailchimpStatus = '';
  lead.mailchimpSyncError = null;
  await lead.save();
  await recordConversionEvent(lead._id, {
    fromStage: '',
    toStage: 'churned',
    source: 'gdpr_delete',
    metadata: { previousEmailHash: subscriberHash(emailBefore) },
  });
  return serializeLead(lead);
}

async function createLead(data, { source = 'admin' } = {}) {
  const email = String(data.email || '').trim().toLowerCase();
  if (!email) {
    const err = new Error('Email is required.');
    err.statusCode = 400;
    throw err;
  }
  const existing = await Lead.findOne({ email });
  if (existing) {
    const err = new Error('A lead with this email already exists.');
    err.statusCode = 409;
    throw err;
  }
  const lead = await Lead.create({
    email,
    firstName: data.firstName || '',
    lastName: data.lastName || '',
    fullName: data.fullName || '',
    country: data.country ? String(data.country).toUpperCase().slice(0, 2) : '',
    language: data.language ? String(data.language).toLowerCase().slice(0, 2) : '',
    phone: data.phone || '',
    company: data.company || '',
    consentStatus: data.consentStatus || 'opted_in',
    consentSource: source,
    consentAt: data.consentStatus !== 'opted_out' ? new Date() : null,
    conversionStage: data.conversionStage || 'lead',
    tags: data.tags || [],
    sourceLabel: data.sourceLabel || '',
  });
  return serializeLead(lead);
}

async function bulkUpdateLeads({ filter = {}, patch = {} } = {}) {
  const query = buildLeadFilter(filter);
  const leads = await Lead.find(query).select('_id').lean();
  let updated = 0;
  for (const row of leads) {
    const result = await updateLead(row._id, patch, { source: 'admin_bulk' });
    if (result) updated += 1;
  }
  return { updated, matched: leads.length };
}

async function exportLeadsCsv({ country, language, consentStatus, conversionStage, q, limit = 5000 } = {}) {
  const filter = buildLeadFilter({ country, language, consentStatus, conversionStage, q });
  const cap = Math.min(10000, Math.max(1, Number(limit) || 5000));
  const rows = await Lead.find(filter).sort({ updatedAt: -1 }).limit(cap).lean();
  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const header = 'email,first_name,last_name,country,language,phone,company,consent_status,conversion_stage,source_label,tags,mailchimp_status,updated_at';
  const lines = rows.map((r) =>
    [
      esc(r.email),
      esc(r.firstName),
      esc(r.lastName),
      esc(r.country),
      esc(r.language),
      esc(r.phone),
      esc(r.company),
      esc(r.consentStatus),
      esc(r.conversionStage),
      esc(r.sourceLabel),
      esc((r.tags || []).join(';')),
      esc(r.mailchimpStatus),
      esc(r.updatedAt ? new Date(r.updatedAt).toISOString() : ''),
    ].join(','),
  );
  return { csv: [header, ...lines].join('\n'), count: rows.length };
}

module.exports = {
  serializeLead,
  listLeads,
  getLeadDetail,
  getLeadStats,
  updateLead,
  createLead,
  bulkUpdateLeads,
  exportLeadsCsv,
  archiveLead,
  deleteLeadPermanent,
  buildLeadFilter,
  recordConversionEvent,
  getLeadCampaignActivity,
};
