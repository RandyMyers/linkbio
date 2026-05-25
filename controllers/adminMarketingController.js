const fs = require('fs');
const path = require('path');
const os = require('os');
const PlatformSettings = require('../models/PlatformSettings');
const Lead = require('../models/Lead');
const LeadImportBatch = require('../models/LeadImportBatch');
const LeadImportRow = require('../models/LeadImportRow');
const LeadImportMappingTemplate = require('../models/LeadImportMappingTemplate');
const { asyncHandler } = require('../middleware/errorHandler');
const {
  serializeMailchimpSettings,
  patchMailchimpSettings,
} = require('../lib/mailchimpSettings');
const { ping, getRoot } = require('../lib/mailchimpClient');
const { LEAD_FIELDS } = require('../lib/leadFieldMapping');
const {
  listLeads,
  getLeadStats,
  getLeadDetail,
  updateLead,
  createLead,
  bulkUpdateLeads,
  exportLeadsCsv,
  archiveLead,
  deleteLeadPermanent,
} = require('../services/leadService');
const {
  parseUploadBuffer,
  previewImport,
  executeImport,
  listMappingTemplates,
  saveMappingTemplate,
  updateMappingTemplate,
  deleteMappingTemplate,
  exportImportErrorsCsv,
} = require('../services/leadImportService');
const { parseCsv } = require('../lib/csvParse');
const { syncLeadToMailchimp } = require('../services/mailchimpMemberSync');
const { provisionMergeFields } = require('../services/mailchimpMergeFieldsSetup');
const {
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
  sendCampaignTest,
  replicateCampaign,
  cancelCampaignSend,
} = require('../services/mailchimpCampaignService');
const {
  fetchAndCacheReport,
  getReportOpenDetails,
  getCampaignPerformanceSummary,
} = require('../services/mailchimpReportService');
const { createSegmentFromLeadFilters } = require('../services/mailchimpSegmentService');
const { searchMembers } = require('../services/mailchimpSearchService');
const { scheduleImport } = require('../services/scheduledImportService');
const { registerListWebhook, webhookUrl } = require('../services/mailchimpWebhookService');
const { getContactQuota, listMailchimpAudiences } = require('../services/mailchimpQuotaService');
const {
  getAudienceDetail,
  listAudienceMembers,
  getAudienceActivity,
  listAudienceSegments,
  listAudienceTags,
} = require('../services/mailchimpAudiencesService');
const { listTemplates, getTemplate, createTemplate } = require('../services/mailchimpTemplatesService');
const {
  listCampaignGroups,
  getCampaignGroup,
  createCampaignGroupId,
} = require('../services/campaignGroupService');
const {
  getConversionsByCountry,
  getConversionsByLanguage,
  getFunnel,
  getCampaignGeoPerformance,
} = require('../services/leadAnalyticsService');
const { processMarketingSyncQueue } = require('../jobs/marketingJobs');

exports.getMarketingSettings = asyncHandler(async (req, res) => {
  const doc = await PlatformSettings.findById('global').lean();
  res.json({ mailchimp: serializeMailchimpSettings(doc?.mailchimp) });
});

exports.patchMarketingSettings = asyncHandler(async (req, res) => {
  const body = req.body?.mailchimp || req.body || {};
  const updates = {};
  if (body.enabled !== undefined) updates.enabled = !!body.enabled;
  if (body.defaultListId !== undefined) updates.defaultListId = String(body.defaultListId).trim();
  if (body.fromName !== undefined) updates.fromName = String(body.fromName).trim().slice(0, 120);
  if (body.fromEmail !== undefined) updates.fromEmail = String(body.fromEmail).trim().slice(0, 200);
  if (body.replyTo !== undefined) updates.replyTo = String(body.replyTo).trim().slice(0, 200);
  if (body.doubleOptIn !== undefined) updates.doubleOptIn = !!body.doubleOptIn;
  if (body.contactLimit !== undefined) updates.contactLimit = Math.max(0, Number(body.contactLimit) || 0);
  if (body.webhookSecret !== undefined && body.webhookSecret !== '••••••••') {
    updates.webhookSecret = String(body.webhookSecret).trim().slice(0, 64);
  }
  if (body.conversionStages !== undefined && Array.isArray(body.conversionStages)) {
    updates.conversionStages = body.conversionStages.map((s) => String(s).trim()).filter(Boolean);
  }
  if (body.supportedLanguages !== undefined && Array.isArray(body.supportedLanguages)) {
    updates.supportedLanguages = body.supportedLanguages.map((s) => String(s).trim().toLowerCase()).filter(Boolean);
  }
  if (body.autoSyncSignups !== undefined) updates.autoSyncSignups = !!body.autoSyncSignups;
  if (body.autoSyncSubscribers !== undefined) updates.autoSyncSubscribers = !!body.autoSyncSubscribers;
  if (body.autoSyncPaidSubscribers !== undefined) {
    updates.autoSyncPaidSubscribers = !!body.autoSyncPaidSubscribers;
  }

  const apiKeyPlain = body.apiKey !== undefined ? body.apiKey : undefined;
  const mailchimp = await patchMailchimpSettings(updates, { apiKeyPlain });
  res.json({ mailchimp });
});

exports.testMarketingConnection = asyncHandler(async (req, res) => {
  const pingResult = await ping();
  const root = await getRoot();
  await PlatformSettings.updateOne(
    { _id: 'global' },
    { $set: { 'mailchimp.lastHealthCheckAt': new Date() } },
  );
  res.json({
    ok: true,
    ping: pingResult,
    accountName: root.account_name,
    totalSubscribers: root.total_subscribers,
  });
});

exports.getLeadFieldDefinitions = asyncHandler(async (_req, res) => {
  res.json({ fields: LEAD_FIELDS });
});

exports.listLeads = asyncHandler(async (req, res) => {
  const data = await listLeads({
    page: req.query.page,
    limit: req.query.limit,
    country: req.query.country,
    language: req.query.language,
    consentStatus: req.query.consentStatus,
    conversionStage: req.query.conversionStage,
    importBatchId: req.query.importBatchId,
    tag: req.query.tag,
    q: req.query.q,
  });
  res.json(data);
});

exports.getLeadStats = asyncHandler(async (_req, res) => {
  const stats = await getLeadStats();
  res.json({ stats });
});

exports.getLead = asyncHandler(async (req, res) => {
  const detail = await getLeadDetail(req.params.id);
  if (!detail) {
    res.status(404).json({ error: 'Lead not found' });
    return;
  }
  res.json(detail);
});

exports.deleteLead = asyncHandler(async (req, res) => {
  const lead = await archiveLead(req.params.id);
  if (!lead) {
    res.status(404).json({ error: 'Lead not found' });
    return;
  }
  await syncLeadToMailchimp(req.params.id);
  res.json({ lead });
});

exports.deleteLeadPermanent = asyncHandler(async (req, res) => {
  if (!req.body?.confirm) {
    res.status(400).json({ error: 'confirm: true required for permanent erasure' });
    return;
  }
  const lead = await deleteLeadPermanent(req.params.id);
  if (!lead) {
    res.status(404).json({ error: 'Lead not found' });
    return;
  }
  res.json({ lead, ok: true });
});

exports.patchLead = asyncHandler(async (req, res) => {
  const lead = await updateLead(req.params.id, req.body || {});
  if (!lead) {
    res.status(404).json({ error: 'Lead not found' });
    return;
  }
  if (req.body?.syncMailchimp !== false) {
    await syncLeadToMailchimp(req.params.id);
  }
  const refreshed = await getLeadDetail(req.params.id);
  res.json(refreshed);
});

exports.syncLead = asyncHandler(async (req, res) => {
  const result = await syncLeadToMailchimp(req.params.id);
  res.json(result);
});

exports.uploadImport = asyncHandler(async (req, res) => {
  const file = req.files?.file || req.files?.csv;
  if (!file) {
    res.status(400).json({ error: 'CSV file required (field: file)' });
    return;
  }
  const buffer = file.data || fs.readFileSync(file.tempFilePath);
  const parsed = parseUploadBuffer(buffer);
  const name = String(req.body?.name || file.name || 'CSV import').trim().slice(0, 120);
  const defaultTpl = await LeadImportMappingTemplate.findOne({ isDefault: true }).lean();
  const columnMapping = defaultTpl?.columnMapping || parsed.suggestedMapping;

  const batch = await LeadImportBatch.create({
    name,
    filename: file.name || 'import.csv',
    status: 'mapping',
    columnMapping,
    duplicatePolicy: req.body?.duplicatePolicy || 'update',
    defaultConsentStatus: req.body?.defaultConsentStatus || 'opted_in',
    createdBy: req.userId || null,
  });

  const tempPath = path.join(os.tmpdir(), `lead-import-${batch._id}.csv`);
  fs.writeFileSync(tempPath, buffer);
  batch.tempFilePath = tempPath;
  await batch.save();

  res.status(201).json({
    batch: {
      id: batch._id.toString(),
      name: batch.name,
      filename: batch.filename,
      status: batch.status,
    },
    headers: parsed.headers,
    totalRows: parsed.totalRows,
    previewRows: parsed.previewRows,
    suggestedMapping: columnMapping,
    appliedDefaultTemplate: defaultTpl ? { id: defaultTpl._id.toString(), name: defaultTpl.name } : null,
  });
});

exports.previewImport = asyncHandler(async (req, res) => {
  const batch = await LeadImportBatch.findById(req.params.batchId);
  if (!batch || !batch.tempFilePath) {
    res.status(404).json({ error: 'Import batch not found' });
    return;
  }
  const buffer = fs.readFileSync(batch.tempFilePath);
  const { headers, rows } = parseCsv(buffer.toString('utf8'));
  const columnMapping = req.body?.columnMapping || batch.columnMapping;

  batch.columnMapping = columnMapping;
  if (req.body?.duplicatePolicy) batch.duplicatePolicy = req.body.duplicatePolicy;
  if (req.body?.defaultConsentStatus) batch.defaultConsentStatus = req.body.defaultConsentStatus;
  if (req.body?.defaultTags) batch.defaultTags = req.body.defaultTags;
  batch.status = 'previewing';
  await batch.save();

  const report = await previewImport({
    headers,
    rows,
    columnMapping,
    options: {
      defaultConsentStatus: batch.defaultConsentStatus,
      defaultTags: batch.defaultTags,
    },
  });

  const quota = await getContactQuota();
  let quotaWarning = null;
  if (quota.limit > 0 && quota.used + report.valid > quota.limit) {
    quotaWarning = {
      message: `Import would exceed contact limit (${quota.used + report.valid} / ${quota.limit}).`,
      projected: quota.used + report.valid,
      limit: quota.limit,
      headroom: quota.headroom,
    };
  }

  res.json({ batchId: batch._id.toString(), report, columnMapping, quotaWarning });
});

exports.executeImport = asyncHandler(async (req, res) => {
  const batch = await LeadImportBatch.findById(req.params.batchId);
  if (!batch || !batch.tempFilePath) {
    res.status(404).json({ error: 'Import batch not found' });
    return;
  }
  if (batch.status === 'processing') {
    res.status(409).json({ error: 'Import already in progress' });
    return;
  }

  if (req.body?.columnMapping) {
    batch.columnMapping = req.body.columnMapping;
    await batch.save();
  }

  const buffer = fs.readFileSync(batch.tempFilePath);
  const { headers, rows } = parseCsv(buffer.toString('utf8'));

  const result = await executeImport(batch._id, {
    headers,
    rows,
    userId: req.userId,
  });

  try {
    fs.unlinkSync(batch.tempFilePath);
    batch.tempFilePath = '';
    await batch.save();
  } catch {
    /* ignore */
  }

  if (req.body?.saveTemplate && req.body?.templateName) {
    await saveMappingTemplate({
      name: req.body.templateName,
      columnMapping: batch.columnMapping,
      defaultTags: batch.defaultTags,
      defaultConsentStatus: batch.defaultConsentStatus,
      userId: req.userId,
      isDefault: !!req.body.setAsDefaultTemplate,
    });
  }

  res.json(result);
});

exports.listImports = asyncHandler(async (_req, res) => {
  const rows = await LeadImportBatch.find().sort({ createdAt: -1 }).limit(50).lean();
  res.json({
    imports: rows.map((b) => ({
      id: b._id.toString(),
      name: b.name,
      filename: b.filename,
      status: b.status,
      stats: b.stats,
      createdAt: b.createdAt,
      finishedAt: b.finishedAt,
    })),
  });
});

exports.getImport = asyncHandler(async (req, res) => {
  const batch = await LeadImportBatch.findById(req.params.batchId).lean();
  if (!batch) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const errors = await LeadImportRow.find({ batchId: batch._id, outcome: 'error' })
    .sort({ rowNumber: 1 })
    .limit(100)
    .lean();
  res.json({
    batch: {
      id: batch._id.toString(),
      name: batch.name,
      status: batch.status,
      columnMapping: batch.columnMapping,
      stats: batch.stats,
    },
    errors: errors.map((e) => ({
      rowNumber: e.rowNumber,
      message: e.errorMessage,
      raw: e.raw,
    })),
  });
});

exports.listImportTemplates = asyncHandler(async (_req, res) => {
  const templates = await listMappingTemplates();
  res.json({ templates });
});

exports.createImportTemplate = asyncHandler(async (req, res) => {
  const { name, columnMapping, defaultTags, defaultConsentStatus, isDefault } = req.body || {};
  if (!name || !columnMapping) {
    res.status(400).json({ error: 'name and columnMapping required' });
    return;
  }
  const template = await saveMappingTemplate({
    name,
    columnMapping,
    defaultTags,
    defaultConsentStatus,
    userId: req.userId,
    isDefault,
  });
  res.status(201).json({ template });
});

exports.scheduleImport = asyncHandler(async (req, res) => {
  const scheduledAt = req.body?.scheduledAt;
  if (!scheduledAt) {
    res.status(400).json({ error: 'scheduledAt required (ISO8601)' });
    return;
  }
  const result = await scheduleImport(req.params.batchId, scheduledAt);
  res.json(result);
});

exports.patchImportTemplate = asyncHandler(async (req, res) => {
  const template = await updateMappingTemplate(req.params.id, req.body || {});
  if (!template) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  res.json({ template });
});

exports.deleteImportTemplate = asyncHandler(async (req, res) => {
  const ok = await deleteMappingTemplate(req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  res.json({ ok: true });
});

exports.exportImportErrorsCsv = asyncHandler(async (req, res) => {
  const batch = await LeadImportBatch.findById(req.params.batchId).lean();
  if (!batch) {
    res.status(404).json({ error: 'Import batch not found' });
    return;
  }
  const { csv, count } = await exportImportErrorsCsv(req.params.batchId);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="import-${req.params.batchId}-errors.csv"`);
  res.setHeader('X-Export-Count', String(count));
  res.send(csv);
});

exports.getAnalyticsConversionsByCountry = asyncHandler(async (_req, res) => {
  res.json(await getConversionsByCountry());
});

exports.getAnalyticsConversionsByLanguage = asyncHandler(async (_req, res) => {
  res.json(await getConversionsByLanguage());
});

exports.getAnalyticsFunnel = asyncHandler(async (req, res) => {
  res.json(await getFunnel({ country: req.query.country, language: req.query.language }));
});

exports.getCampaignGeoAnalytics = asyncHandler(async (req, res) => {
  const data = await getCampaignGeoPerformance(req.params.id);
  if (!data) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }
  res.json(data);
});

exports.getMarketingHealth = asyncHandler(async (_req, res) => {
  const doc = await PlatformSettings.findById('global').lean();
  const mc = doc?.mailchimp || {};
  let pingOk = null;
  if (mc.enabled && mc.apiKeyEncrypted) {
    try {
      await ping();
      pingOk = true;
    } catch (err) {
      pingOk = false;
    }
  }
  const [syncErrors, unsynced] = await Promise.all([
    Lead.countDocuments({ mailchimpSyncError: { $exists: true, $nin: [null, ''] } }),
    Lead.countDocuments({ consentStatus: { $in: ['opted_in', 'pending'] }, mailchimpLastSyncAt: null }),
  ]);
  res.json({
    enabled: !!mc.enabled,
    lastHealthCheckAt: mc.lastHealthCheckAt ? new Date(mc.lastHealthCheckAt).toISOString() : null,
    pingOk,
    syncErrors,
    unsynced,
    mergeFieldsProvisioned: !!mc.mergeFieldsProvisioned,
  });
});

exports.runSyncQueue = asyncHandler(async (_req, res) => {
  const result = await processMarketingSyncQueue();
  res.json(result);
});

exports.sendCampaignTest = asyncHandler(async (req, res) => {
  const testEmails = req.body?.testEmails || req.body?.test_emails;
  const result = await sendCampaignTest(req.params.id, testEmails);
  if (!result) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }
  res.json(result);
});

exports.getQuota = asyncHandler(async (_req, res) => {
  const doc = await PlatformSettings.findById('global').lean();
  const mc = doc?.mailchimp || {};
  const used = await Lead.countDocuments({ consentStatus: { $in: ['opted_in', 'pending'] } });
  const limit = Number(mc.contactLimit) || 0;
  res.json({
    used,
    limit,
    headroom: limit > 0 ? Math.max(0, limit - used) : null,
    pct: limit > 0 ? Math.round((used / limit) * 1000) / 10 : null,
  });
});

exports.listAudiences = asyncHandler(async (_req, res) => {
  const data = await listMailchimpAudiences();
  res.json(data);
});

exports.getAudience = asyncHandler(async (req, res) => {
  const audience = await getAudienceDetail(req.params.listId);
  res.json({ audience });
});

exports.listAudienceMembers = asyncHandler(async (req, res) => {
  const data = await listAudienceMembers(req.params.listId, {
    status: req.query.status,
    count: req.query.count,
    offset: req.query.offset,
  });
  res.json(data);
});

exports.getAudienceActivity = asyncHandler(async (req, res) => {
  const data = await getAudienceActivity(req.params.listId);
  res.json(data);
});

exports.listAudienceSegments = asyncHandler(async (req, res) => {
  const data = await listAudienceSegments(req.params.listId);
  res.json(data);
});

exports.listAudienceTags = asyncHandler(async (req, res) => {
  const data = await listAudienceTags(req.params.listId);
  res.json(data);
});

exports.createAudienceSegment = asyncHandler(async (req, res) => {
  const data = await createSegmentFromLeadFilters({
    name: req.body?.name,
    filter: req.body?.filter || {},
    listId: req.params.listId,
  });
  res.status(201).json(data);
});

exports.searchMailchimpMembers = asyncHandler(async (req, res) => {
  const data = await searchMembers(req.query.q, { count: req.query.count });
  res.json(data);
});

exports.getCampaignPerformance = asyncHandler(async (_req, res) => {
  res.json(await getCampaignPerformanceSummary({ limit: 10 }));
});

exports.listMailchimpTemplates = asyncHandler(async (req, res) => {
  const data = await listTemplates({ count: req.query.count, type: req.query.type });
  res.json(data);
});

exports.getMailchimpTemplate = asyncHandler(async (req, res) => {
  const template = await getTemplate(req.params.templateId);
  res.json({ template });
});

exports.createMailchimpTemplate = asyncHandler(async (req, res) => {
  const template = await createTemplate(req.body || {});
  res.status(201).json({ template });
});

exports.listCampaignGroups = asyncHandler(async (_req, res) => {
  const data = await listCampaignGroups();
  res.json(data);
});

exports.getCampaignGroup = asyncHandler(async (req, res) => {
  const group = await getCampaignGroup(req.params.groupId);
  if (!group) {
    res.status(404).json({ error: 'Campaign group not found' });
    return;
  }
  res.json({ group });
});

exports.createCampaignGroup = asyncHandler(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) {
    res.status(400).json({ error: 'Group name required' });
    return;
  }
  res.status(201).json({ id: createCampaignGroupId(name), name });
});

exports.provisionMergeFields = asyncHandler(async (_req, res) => {
  const result = await provisionMergeFields();
  res.json(result);
});

exports.registerWebhook = asyncHandler(async (_req, res) => {
  const result = await registerListWebhook();
  res.json(result);
});

exports.getWebhookInfo = asyncHandler(async (_req, res) => {
  const doc = await PlatformSettings.findById('global').lean();
  const secret = doc?.mailchimp?.webhookSecret || '';
  res.json({ url: webhookUrl(secret), hasSecret: Boolean(secret) });
});

exports.createLead = asyncHandler(async (req, res) => {
  const lead = await createLead(req.body || {});
  if (req.body?.syncMailchimp !== false) {
    await syncLeadToMailchimp(lead.id);
    const refreshed = await getLeadDetail(lead.id);
    res.status(201).json(refreshed);
    return;
  }
  res.status(201).json({ lead });
});

exports.bulkUpdateLeads = asyncHandler(async (req, res) => {
  const { filter, patch } = req.body || {};
  if (!patch || !Object.keys(patch).length) {
    res.status(400).json({ error: 'patch required' });
    return;
  }
  const result = await bulkUpdateLeads({ filter: filter || {}, patch });
  res.json(result);
});

exports.exportLeadsCsv = asyncHandler(async (req, res) => {
  const { csv, count } = await exportLeadsCsv({
    country: req.query.country,
    language: req.query.language,
    consentStatus: req.query.consentStatus,
    conversionStage: req.query.conversionStage,
    q: req.query.q,
    limit: req.query.limit,
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="leads-export.csv"');
  res.setHeader('X-Export-Count', String(count));
  res.send(csv);
});

exports.listCampaigns = asyncHandler(async (req, res) => {
  const data = await listCampaigns({ page: req.query.page, limit: req.query.limit });
  res.json(data);
});

exports.getCampaign = asyncHandler(async (req, res) => {
  const campaign = await getCampaign(req.params.id);
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }
  res.json({ campaign });
});

exports.createCampaign = asyncHandler(async (req, res) => {
  const campaign = await createCampaign(req.body || {}, { userId: req.userId });
  res.status(201).json({ campaign });
});

exports.patchCampaign = asyncHandler(async (req, res) => {
  const campaign = await updateCampaign(req.params.id, req.body || {});
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }
  if (req.body?.htmlContent !== undefined || req.body?.plainText !== undefined) {
    await updateCampaignContent(req.params.id);
  }
  res.json({ campaign });
});

exports.deleteCampaign = asyncHandler(async (req, res) => {
  const ok = await deleteCampaign(req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }
  res.json({ ok: true });
});

exports.previewCampaignRecipients = asyncHandler(async (req, res) => {
  const estimate = await previewRecipients(req.params.id);
  if (!estimate) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }
  res.json({ estimate });
});

exports.getCampaignChecklist = asyncHandler(async (req, res) => {
  const checklist = await getSendChecklist(req.params.id);
  if (!checklist) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }
  res.json({ checklist });
});

exports.sendCampaign = asyncHandler(async (req, res) => {
  try {
    const campaign = await sendCampaign(req.params.id);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }
    res.json({ campaign });
  } catch (err) {
    if (err.checklist) {
      res.status(err.statusCode || 400).json({ error: err.message, checklist: err.checklist });
      return;
    }
    throw err;
  }
});

exports.scheduleCampaign = asyncHandler(async (req, res) => {
  const scheduleTime = req.body?.scheduleTime || req.body?.schedule_time;
  if (!scheduleTime) {
    res.status(400).json({ error: 'scheduleTime required' });
    return;
  }
  const campaign = await scheduleCampaign(req.params.id, scheduleTime);
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }
  res.json({ campaign });
});

exports.unscheduleCampaign = asyncHandler(async (req, res) => {
  const campaign = await unscheduleCampaign(req.params.id);
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }
  res.json({ campaign });
});

exports.getCampaignReport = asyncHandler(async (req, res) => {
  const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
  const report = await fetchAndCacheReport(req.params.id, { refresh });
  if (!report) {
    res.status(404).json({ error: 'Report not available yet' });
    return;
  }
  res.json({ report });
});

exports.getCampaignReportOpens = asyncHandler(async (req, res) => {
  const data = await getReportOpenDetails(req.params.id);
  if (!data) {
    res.status(404).json({ error: 'Report not available' });
    return;
  }
  res.json(data);
});

exports.putCampaignContent = asyncHandler(async (req, res) => {
  const campaign = await updateCampaign(req.params.id, {
    htmlContent: req.body?.htmlContent,
    plainText: req.body?.plainText,
  });
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }
  const updated = await updateCampaignContent(req.params.id);
  res.json({ campaign: updated });
});

exports.replicateCampaign = asyncHandler(async (req, res) => {
  const campaign = await replicateCampaign(req.params.id);
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }
  res.status(201).json({ campaign });
});

exports.cancelCampaignSend = asyncHandler(async (req, res) => {
  try {
    const campaign = await cancelCampaignSend(req.params.id);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }
    res.json({ campaign });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});
