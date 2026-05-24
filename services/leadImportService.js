const fs = require('fs');
const Lead = require('../models/Lead');
const LeadImportBatch = require('../models/LeadImportBatch');
const LeadImportRow = require('../models/LeadImportRow');
const LeadImportMappingTemplate = require('../models/LeadImportMappingTemplate');
const { parseCsv } = require('../lib/csvParse');
const { suggestMapping, normalizeConsentStatus } = require('../lib/leadFieldMapping');
const { normalizeCountry } = require('../lib/countryNormalize');
const { normalizeLanguage } = require('../lib/languageNormalize');
const { recordConversionEvent } = require('./leadService');
const { syncLeadsBatch } = require('./mailchimpMemberSync');
const { subscriberHash } = require('../lib/mailchimpSubscriberHash');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function rowToObject(headers, cells) {
  const obj = {};
  headers.forEach((h, i) => {
    obj[h] = cells[i] != null ? String(cells[i]) : '';
  });
  return obj;
}

function applyMapping(rawRow, headers, columnMapping, options) {
  const row = rowToObject(headers, rawRow);
  const out = {
    customFields: {},
    tags: [...(options.defaultTags || [])],
  };

  for (const [csvCol, fieldId] of Object.entries(columnMapping || {})) {
    if (!fieldId || fieldId === 'skip') continue;
    const val = row[csvCol];
    if (val === undefined || val === '') continue;

    if (fieldId.startsWith('customFields.')) {
      const key = fieldId.replace(/^customFields\./, '');
      out.customFields[key] = val;
      continue;
    }

    switch (fieldId) {
      case 'email':
        out.email = val.trim().toLowerCase();
        break;
      case 'country':
        out.country = normalizeCountry(val);
        break;
      case 'language':
        out.language = normalizeLanguage(val);
        break;
      case 'consentStatus':
        out.consentStatus = normalizeConsentStatus(val, options.defaultConsentStatus);
        break;
      case 'tags':
        out.tags.push(...val.split(/[,;]/).map((t) => t.trim()).filter(Boolean));
        break;
      default:
        out[fieldId] = String(val).trim();
        break;
    }
  }

  if (!out.consentStatus) out.consentStatus = options.defaultConsentStatus || 'opted_in';
  if (out.fullName && !out.firstName) {
    const parts = out.fullName.split(/\s+/);
    out.firstName = parts[0] || '';
    out.lastName = parts.slice(1).join(' ') || '';
  }
  if (out.country && !out.language) {
    const infer = { FR: 'fr', BE: 'fr', CH: 'fr', US: 'en', GB: 'en', ES: 'es', DE: 'de', PT: 'pt', BR: 'pt' };
    if (infer[out.country]) out.language = infer[out.country];
  }
  return out;
}

function parseUploadBuffer(buffer) {
  const text = buffer.toString('utf8');
  const { headers, rows } = parseCsv(text, { maxRows: 0 });
  const preview = parseCsv(text, { maxRows: 5 }).rows;
  return {
    headers,
    totalRows: rows.length,
    previewRows: preview.map((cells) => rowToObject(headers, cells)),
    suggestedMapping: suggestMapping(headers),
  };
}

async function previewImport({ headers, rows, columnMapping, options }) {
  const report = {
    valid: 0,
    invalid: 0,
    duplicatesInFile: 0,
    byCountry: {},
    byLanguage: {},
    errors: [],
  };
  const seen = new Set();

  rows.forEach((cells, idx) => {
    try {
      const mapped = applyMapping(cells, headers, columnMapping, options);
      if (!mapped.email || !EMAIL_RE.test(mapped.email)) {
        report.invalid += 1;
        if (report.errors.length < 20) {
          report.errors.push({ row: idx + 2, message: 'Invalid or missing email' });
        }
        return;
      }
      if (seen.has(mapped.email)) {
        report.duplicatesInFile += 1;
      }
      seen.add(mapped.email);
      report.valid += 1;
      if (mapped.country) {
        report.byCountry[mapped.country] = (report.byCountry[mapped.country] || 0) + 1;
      }
      if (mapped.language) {
        report.byLanguage[mapped.language] = (report.byLanguage[mapped.language] || 0) + 1;
      }
    } catch (e) {
      report.invalid += 1;
      if (report.errors.length < 20) {
        report.errors.push({ row: idx + 2, message: e.message });
      }
    }
  });
  return report;
}

async function executeImport(batchId, { headers, rows, userId }) {
  const batch = await LeadImportBatch.findById(batchId);
  if (!batch) throw new Error('Import batch not found');

  batch.status = 'processing';
  batch.startedAt = new Date();
  await batch.save();

  const options = {
    defaultConsentStatus: batch.defaultConsentStatus,
    defaultTags: batch.defaultTags || [],
  };
  const stats = {
    totalRows: rows.length,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    byCountry: {},
    byLanguage: {},
  };
  const syncedLeadIds = [];

  for (let i = 0; i < rows.length; i += 1) {
    const cells = rows[i];
    const rowNum = i + 2;
    const raw = rowToObject(headers, cells);

    try {
      const mapped = applyMapping(cells, headers, batch.columnMapping, options);
      if (!mapped.email || !EMAIL_RE.test(mapped.email)) {
        stats.errors += 1;
        await LeadImportRow.create({
          batchId: batch._id,
          rowNumber: rowNum,
          raw,
          outcome: 'error',
          errorMessage: 'Invalid email',
        });
        continue;
      }

      let lead = await Lead.findOne({ email: mapped.email });
      let outcome = 'created';

      if (lead) {
        if (batch.duplicatePolicy === 'skip') {
          stats.skipped += 1;
          await LeadImportRow.create({
            batchId: batch._id,
            rowNumber: rowNum,
            raw,
            outcome: 'skipped',
            leadId: lead._id,
          });
          continue;
        }
        outcome = 'updated';
        const beforeStage = lead.conversionStage;
        const fields = [
          'firstName', 'lastName', 'fullName', 'country', 'language', 'city', 'region',
          'phone', 'company', 'consentStatus', 'conversionStage', 'sourceLabel',
        ];
        for (const f of fields) {
          if (mapped[f] !== undefined && mapped[f] !== '') {
            if (batch.duplicatePolicy === 'update_all' || !lead[f]) {
              lead[f] = mapped[f];
            }
          }
        }
        if (batch.duplicatePolicy === 'update_all' && mapped.customFields) {
          lead.customFields = { ...(lead.customFields || {}), ...mapped.customFields };
        } else if (mapped.customFields) {
          lead.customFields = { ...(lead.customFields || {}), ...mapped.customFields };
        }
        if (mapped.tags?.length) {
          lead.tags = [...new Set([...(lead.tags || []), ...mapped.tags])];
        }
        if (mapped.conversionStage && mapped.conversionStage !== beforeStage) {
          await recordConversionEvent(lead._id, {
            fromStage: beforeStage,
            toStage: mapped.conversionStage,
            source: 'csv_import',
          });
        }
      } else {
        lead = new Lead({
          ...mapped,
          consentSource: 'csv_import',
          consentAt: new Date(),
          importBatchId: batch._id,
          mailchimpMemberHash: subscriberHash(mapped.email),
        });
      }

      lead.importBatchId = batch._id;
      if (!lead.sourceLabel && batch.name) lead.sourceLabel = batch.name;
      await lead.save();
      syncedLeadIds.push(lead._id.toString());

      if (outcome === 'created') stats.created += 1;
      else stats.updated += 1;

      if (lead.country) stats.byCountry[lead.country] = (stats.byCountry[lead.country] || 0) + 1;
      if (lead.language) stats.byLanguage[lead.language] = (stats.byLanguage[lead.language] || 0) + 1;

      await LeadImportRow.create({
        batchId: batch._id,
        rowNumber: rowNum,
        raw,
        outcome,
        leadId: lead._id,
      });
    } catch (err) {
      stats.errors += 1;
      await LeadImportRow.create({
        batchId: batch._id,
        rowNumber: rowNum,
        raw,
        outcome: 'error',
        errorMessage: String(err.message || err).slice(0, 500),
      });
    }
  }

  batch.stats = stats;
  batch.status = 'done';
  batch.finishedAt = new Date();
  await batch.save();

  if (syncedLeadIds.length) {
    await syncLeadsBatch(syncedLeadIds.slice(0, 500));
  }

  return { batchId: batch._id.toString(), stats };
}

async function createBatchFromUpload({ name, filename, headers, columnMapping, userId, options = {} }) {
  return LeadImportBatch.create({
    name: name || filename || 'CSV import',
    filename: filename || '',
    status: 'mapping',
    columnMapping: columnMapping || {},
    duplicatePolicy: options.duplicatePolicy || 'update',
    defaultConsentStatus: options.defaultConsentStatus || 'opted_in',
    defaultTags: options.defaultTags || [],
    mappingTemplateId: options.mappingTemplateId || null,
    createdBy: userId || null,
  });
}

async function listMappingTemplates() {
  const rows = await LeadImportMappingTemplate.find().sort({ updatedAt: -1 }).limit(50).lean();
  return rows.map((t) => ({
    id: t._id.toString(),
    name: t.name,
    columnMapping: t.columnMapping,
    defaultTags: t.defaultTags || [],
    defaultConsentStatus: t.defaultConsentStatus,
  }));
}

async function saveMappingTemplate({ name, columnMapping, defaultTags, defaultConsentStatus, userId }) {
  const doc = await LeadImportMappingTemplate.create({
    name,
    columnMapping,
    defaultTags: defaultTags || [],
    defaultConsentStatus: defaultConsentStatus || 'opted_in',
    createdBy: userId || null,
  });
  return { id: doc._id.toString(), name: doc.name };
}

function readCsvFile(path) {
  const buffer = fs.readFileSync(path);
  return parseUploadBuffer(buffer);
}

module.exports = {
  parseUploadBuffer,
  previewImport,
  executeImport,
  createBatchFromUpload,
  listMappingTemplates,
  saveMappingTemplate,
  readCsvFile,
  applyMapping,
  rowToObject,
};
