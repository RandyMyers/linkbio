const mongoose = require('mongoose');

const mailchimpSyncJobSchema = new mongoose.Schema(
  {
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
    status: {
      type: String,
      enum: ['pending', 'processing', 'done', 'failed'],
      default: 'pending',
      index: true,
    },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: '' },
    nextRetryAt: { type: Date, default: () => new Date(), index: true },
  },
  { timestamps: true },
);

mailchimpSyncJobSchema.index({ status: 1, nextRetryAt: 1 });

module.exports =
  mongoose.models.MailchimpSyncJob || mongoose.model('MailchimpSyncJob', mailchimpSyncJobSchema);
