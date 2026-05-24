const mongoose = require('mongoose');

const leadImportMappingTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    columnMapping: { type: mongoose.Schema.Types.Mixed, default: {} },
    defaultTags: { type: [String], default: [] },
    defaultConsentStatus: {
      type: String,
      enum: ['opted_in', 'opted_out', 'pending'],
      default: 'opted_in',
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

module.exports =
  mongoose.models.LeadImportMappingTemplate ||
  mongoose.model('LeadImportMappingTemplate', leadImportMappingTemplateSchema);
