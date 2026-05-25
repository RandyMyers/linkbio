const fs = require('fs');
const LeadImportBatch = require('../models/LeadImportBatch');
const { readCsvFile, executeImport } = require('./leadImportService');

async function scheduleImport(batchId, scheduledAt) {
  const batch = await LeadImportBatch.findById(batchId);
  if (!batch || !batch.tempFilePath) {
    const err = new Error('Import batch not found or file missing.');
    err.statusCode = 404;
    throw err;
  }
  const when = new Date(scheduledAt);
  if (Number.isNaN(when.getTime()) || when <= new Date()) {
    const err = new Error('Schedule time must be in the future.');
    err.statusCode = 400;
    throw err;
  }
  if (!batch.columnMapping || !Object.values(batch.columnMapping).includes('email')) {
    const err = new Error('Complete column mapping before scheduling.');
    err.statusCode = 400;
    throw err;
  }
  batch.status = 'scheduled';
  batch.scheduledAt = when;
  await batch.save();
  return {
    batchId: batch._id.toString(),
    scheduledAt: when.toISOString(),
    status: batch.status,
  };
}

async function processScheduledImports() {
  const due = await LeadImportBatch.find({
    status: 'scheduled',
    scheduledAt: { $lte: new Date() },
  }).limit(5);

  let processed = 0;
  for (const batch of due) {
    try {
      if (!batch.tempFilePath || !fs.existsSync(batch.tempFilePath)) {
        batch.status = 'failed';
        batch.errorMessage = 'CSV file no longer available.';
        await batch.save();
        continue;
      }
      const { headers, rows } = readCsvFile(batch.tempFilePath);
      batch.status = 'processing';
      await batch.save();
      await executeImport(batch._id, { headers, rows, userId: batch.createdBy });
      try {
        fs.unlinkSync(batch.tempFilePath);
        batch.tempFilePath = '';
        await batch.save();
      } catch {
        /* ignore */
      }
      processed += 1;
    } catch (err) {
      batch.status = 'failed';
      batch.errorMessage = String(err.message || err).slice(0, 500);
      await batch.save();
    }
  }
  return { processed, due: due.length };
}

module.exports = { scheduleImport, processScheduledImports };
