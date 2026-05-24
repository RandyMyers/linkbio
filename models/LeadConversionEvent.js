const mongoose = require('mongoose');

const leadConversionEventSchema = new mongoose.Schema(
  {
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
    fromStage: { type: String, default: '' },
    toStage: { type: String, required: true },
    source: { type: String, default: 'admin', enum: ['admin', 'admin_bulk', 'csv_import', 'api', 'webhook', 'mailchimp_webhook'] },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

module.exports =
  mongoose.models.LeadConversionEvent || mongoose.model('LeadConversionEvent', leadConversionEventSchema);
