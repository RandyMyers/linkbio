const MarketingCampaign = require('../models/MarketingCampaign');
const { mailchimpRequest } = require('../lib/mailchimpClient');
const { getMailchimpSettings } = require('../lib/mailchimpSettings');
const { estimateRecipients, assertSendAllowed } = require('./mailchimpQuotaService');

function serializeCampaign(doc) {
  if (!doc) return null;
  const d = doc.toObject ? doc.toObject() : doc;
  return {
    id: d._id.toString(),
    title: d.title,
    subject: d.subject || '',
    locale: d.locale || '',
    targetLanguages: d.targetLanguages || [],
    targetCountries: d.targetCountries || [],
    targetConversionStages: d.targetConversionStages || [],
    fromName: d.fromName || '',
    replyTo: d.replyTo || '',
    status: d.status,
    mailchimpCampaignId: d.mailchimpCampaignId || '',
    mailchimpListId: d.mailchimpListId || '',
    estimatedRecipients: d.estimatedRecipients,
    recipientBreakdown: d.recipientBreakdown || { byCountry: {}, byLanguage: {} },
    scheduledAt: d.scheduledAt ? new Date(d.scheduledAt).toISOString() : null,
    sentAt: d.sentAt ? new Date(d.sentAt).toISOString() : null,
    htmlContent: d.htmlContent || '',
    plainText: d.plainText || '',
    sendChecklist: d.sendChecklist || null,
    lastReportSyncAt: d.lastReportSyncAt ? new Date(d.lastReportSyncAt).toISOString() : null,
    createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : null,
    updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : null,
  };
}

function buildSegmentOpts(campaign) {
  const conditions = [];
  const langs = campaign.targetLanguages || [];
  const countries = campaign.targetCountries || [];
  const stages = campaign.targetConversionStages || [];

  for (const lang of langs) {
    conditions.push({
      condition_type: 'TextMerge',
      field: 'LANGUAGE',
      op: 'is',
      value: String(lang).toLowerCase(),
    });
  }
  for (const country of countries) {
    conditions.push({
      condition_type: 'TextMerge',
      field: 'COUNTRY',
      op: 'is',
      value: String(country).toUpperCase(),
    });
  }
  for (const stage of stages) {
    conditions.push({
      condition_type: 'TextMerge',
      field: 'STAGE',
      op: 'is',
      value: String(stage),
    });
  }

  if (!conditions.length) return null;

  const match =
    langs.length && (countries.length || stages.length) && countries.length + stages.length > 1
      ? 'all'
      : countries.length > 1 && !langs.length
        ? 'any'
        : 'all';

  return { match, conditions };
}

async function listCampaigns({ page = 1, limit = 50 } = {}) {
  const cap = Math.min(100, Math.max(1, Number(limit) || 50));
  const skip = (Math.max(1, Number(page) || 1) - 1) * cap;
  const [rows, total] = await Promise.all([
    MarketingCampaign.find().sort({ updatedAt: -1 }).skip(skip).limit(cap).lean(),
    MarketingCampaign.countDocuments({}),
  ]);
  return { campaigns: rows.map(serializeCampaign), total, page: Math.max(1, Number(page) || 1), limit: cap };
}

async function getCampaign(id) {
  const doc = await MarketingCampaign.findById(id).lean();
  return doc ? serializeCampaign(doc) : null;
}

async function createCampaign(input, { userId } = {}) {
  const settings = await getMailchimpSettings();
  if (!settings.enabled || !settings.defaultListId) {
    const err = new Error('Mailchimp is not configured.');
    err.statusCode = 400;
    throw err;
  }

  const targets = {
    targetLanguages: input.targetLanguages || [],
    targetCountries: input.targetCountries || [],
    targetConversionStages: input.targetConversionStages || [],
  };
  const estimate = await estimateRecipients(targets);

  const segmentOpts = buildSegmentOpts(targets);
  const recipients = { list_id: settings.defaultListId };
  if (segmentOpts) recipients.segment_opts = segmentOpts;

  const mc = await mailchimpRequest('/campaigns', {
    method: 'POST',
    body: {
      type: 'regular',
      recipients,
      settings: {
        title: String(input.title || 'Untitled').slice(0, 200),
        subject_line: String(input.subject || input.title || '').slice(0, 200),
        from_name: input.fromName || settings.fromName || 'LinkBio',
        reply_to: input.replyTo || settings.replyTo || settings.fromEmail || '',
      },
    },
  });

  const doc = await MarketingCampaign.create({
    title: input.title || 'Untitled',
    subject: input.subject || '',
    locale: input.locale || '',
    targetLanguages: targets.targetLanguages,
    targetCountries: targets.targetCountries,
    targetConversionStages: targets.targetConversionStages,
    fromName: input.fromName || settings.fromName || '',
    replyTo: input.replyTo || settings.replyTo || '',
    status: 'draft',
    mailchimpCampaignId: mc.id,
    mailchimpListId: settings.defaultListId,
    segmentOpts,
    estimatedRecipients: estimate.total,
    recipientBreakdown: { byCountry: estimate.byCountry, byLanguage: estimate.byLanguage },
    htmlContent: input.htmlContent || '',
    plainText: input.plainText || '',
    createdBy: userId || null,
  });

  return serializeCampaign(doc);
}

async function updateCampaign(id, patch) {
  const campaign = await MarketingCampaign.findById(id);
  if (!campaign) return null;

  const fields = [
    'title', 'subject', 'locale', 'targetLanguages', 'targetCountries',
    'targetConversionStages', 'fromName', 'replyTo', 'htmlContent', 'plainText',
  ];
  for (const key of fields) {
    if (patch[key] !== undefined) campaign[key] = patch[key];
  }

  if (
    patch.targetLanguages !== undefined ||
    patch.targetCountries !== undefined ||
    patch.targetConversionStages !== undefined
  ) {
    const estimate = await estimateRecipients({
      targetLanguages: campaign.targetLanguages,
      targetCountries: campaign.targetCountries,
      targetConversionStages: campaign.targetConversionStages,
    });
    campaign.estimatedRecipients = estimate.total;
    campaign.recipientBreakdown = { byCountry: estimate.byCountry, byLanguage: estimate.byLanguage };
    campaign.segmentOpts = buildSegmentOpts(campaign);
  }

  await campaign.save();

  if (campaign.mailchimpCampaignId && (patch.subject || patch.title || patch.fromName || patch.replyTo)) {
    await mailchimpRequest(`/campaigns/${campaign.mailchimpCampaignId}`, {
      method: 'PATCH',
      body: {
        settings: {
          title: campaign.title,
          subject_line: campaign.subject || campaign.title,
          from_name: campaign.fromName,
          reply_to: campaign.replyTo,
        },
      },
    });
  }

  return serializeCampaign(campaign);
}

async function updateCampaignContent(id) {
  const campaign = await MarketingCampaign.findById(id);
  if (!campaign?.mailchimpCampaignId) return null;

  await mailchimpRequest(`/campaigns/${campaign.mailchimpCampaignId}/content`, {
    method: 'PUT',
    body: {
      html: campaign.htmlContent || '<p></p>',
      plain_text: campaign.plainText || '',
    },
  });
  return serializeCampaign(campaign);
}

async function previewRecipients(id) {
  const campaign = await MarketingCampaign.findById(id).lean();
  if (!campaign) return null;
  const estimate = await estimateRecipients({
    targetLanguages: campaign.targetLanguages,
    targetCountries: campaign.targetCountries,
    targetConversionStages: campaign.targetConversionStages,
  });
  await MarketingCampaign.updateOne(
    { _id: id },
    {
      $set: {
        estimatedRecipients: estimate.total,
        recipientBreakdown: { byCountry: estimate.byCountry, byLanguage: estimate.byLanguage },
      },
    },
  );
  return estimate;
}

async function getSendChecklist(id) {
  const campaign = await MarketingCampaign.findById(id);
  if (!campaign?.mailchimpCampaignId) return null;
  const checklist = await mailchimpRequest(`/campaigns/${campaign.mailchimpCampaignId}/send-checklist`);
  campaign.sendChecklist = checklist;
  await campaign.save();
  return checklist;
}

async function sendCampaign(id) {
  const campaign = await MarketingCampaign.findById(id);
  if (!campaign?.mailchimpCampaignId) return null;

  const estimate = await estimateRecipients({
    targetLanguages: campaign.targetLanguages,
    targetCountries: campaign.targetCountries,
    targetConversionStages: campaign.targetConversionStages,
  });
  await assertSendAllowed(estimate.total);

  await updateCampaignContent(id);
  const checklist = await getSendChecklist(id);
  const hasErrors = (checklist?.items || []).some((i) => i.type === 'error');
  if (hasErrors) {
    const err = new Error('Mailchimp send checklist has errors. Fix issues before sending.');
    err.statusCode = 400;
    err.checklist = checklist;
    throw err;
  }

  await mailchimpRequest(`/campaigns/${campaign.mailchimpCampaignId}/actions/send`, { method: 'POST' });
  campaign.status = 'sending';
  campaign.sentAt = new Date();
  campaign.estimatedRecipients = estimate.total;
  await campaign.save();
  return serializeCampaign(campaign);
}

async function scheduleCampaign(id, scheduleTime) {
  const campaign = await MarketingCampaign.findById(id);
  if (!campaign?.mailchimpCampaignId) return null;

  const estimate = await estimateRecipients({
    targetLanguages: campaign.targetLanguages,
    targetCountries: campaign.targetCountries,
    targetConversionStages: campaign.targetConversionStages,
  });
  await assertSendAllowed(estimate.total);

  await updateCampaignContent(id);
  const when = new Date(scheduleTime);
  if (Number.isNaN(when.getTime()) || when <= new Date()) {
    const err = new Error('Schedule time must be in the future.');
    err.statusCode = 400;
    throw err;
  }

  await mailchimpRequest(`/campaigns/${campaign.mailchimpCampaignId}/actions/schedule`, {
    method: 'POST',
    body: { schedule_time: when.toISOString() },
  });
  campaign.status = 'scheduled';
  campaign.scheduledAt = when;
  campaign.estimatedRecipients = estimate.total;
  await campaign.save();
  return serializeCampaign(campaign);
}

async function unscheduleCampaign(id) {
  const campaign = await MarketingCampaign.findById(id);
  if (!campaign?.mailchimpCampaignId) return null;
  await mailchimpRequest(`/campaigns/${campaign.mailchimpCampaignId}/actions/unschedule`, { method: 'POST' });
  campaign.status = 'draft';
  campaign.scheduledAt = null;
  await campaign.save();
  return serializeCampaign(campaign);
}

async function deleteCampaign(id) {
  const campaign = await MarketingCampaign.findById(id);
  if (!campaign) return false;
  if (campaign.mailchimpCampaignId && campaign.status === 'draft') {
    try {
      await mailchimpRequest(`/campaigns/${campaign.mailchimpCampaignId}`, { method: 'DELETE' });
    } catch {
      /* draft may already be gone */
    }
  }
  await MarketingCampaign.deleteOne({ _id: id });
  return true;
}

module.exports = {
  serializeCampaign,
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  updateCampaignContent,
  previewRecipients,
  getSendChecklist,
  sendCampaign,
  scheduleCampaign,
  unscheduleCampaign,
  deleteCampaign,
  buildSegmentOpts,
};
