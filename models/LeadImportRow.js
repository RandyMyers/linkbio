const mongoose = require('mongoose');

const leadImportRowSchema = new mongoose.Schema(
  {
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeadImportBatch', required: true, index: true },
    rowNumber: { type: Number, required: true },
    raw: { type: mongoose.Schema.Types.Mixed, default: {} },
    outcome: {
      type: String,
      enum: ['created', 'updated', 'skipped', 'error'],
      required: true,
    },
    errorMessage: { type: String, default: '' },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
  },
  { timestamps: true },
);

module.exports = mongoose.models.LeadImportRow || mongoose.model('LeadImportRow', leadImportRowSchema);
