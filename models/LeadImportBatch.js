const mongoose = require('mongoose');

const leadImportBatchSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    filename: { type: String, default: '', trim: true },
    tempFilePath: { type: String, default: '', trim: true },
    status: {
      type: String,
      enum: ['uploaded', 'mapping', 'previewing', 'scheduled', 'processing', 'done', 'failed'],
      default: 'uploaded',
    },
    scheduledAt: { type: Date, default: null, index: true },
    columnMapping: { type: mongoose.Schema.Types.Mixed, default: {} },
    mappingTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeadImportMappingTemplate', default: null },
    duplicatePolicy: {
      type: String,
      enum: ['skip', 'update', 'update_all'],
      default: 'update',
    },
    defaultConsentStatus: {
      type: String,
      enum: ['opted_in', 'opted_out', 'pending'],
      default: 'opted_in',
    },
    defaultTags: { type: [String], default: [] },
    stats: {
      totalRows: { type: Number, default: 0 },
      created: { type: Number, default: 0 },
      updated: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
      errors: { type: Number, default: 0 },
      byCountry: { type: mongoose.Schema.Types.Mixed, default: {} },
      byLanguage: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    errorMessage: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

module.exports =
  mongoose.models.LeadImportBatch || mongoose.model('LeadImportBatch', leadImportBatchSchema);
