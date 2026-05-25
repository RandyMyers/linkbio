const MarketingCampaign = require('../models/MarketingCampaign');
const Lead = require('../models/Lead');
const MailchimpSyncJob = require('../models/MailchimpSyncJob');
const { fetchAndCacheReport } = require('../services/mailchimpReportService');
const PlatformSettings = require('../models/PlatformSettings');
const { syncLeadToMailchimp } = require('../services/mailchimpMemberSync');
const { refreshAccountStatsCache } = require('../services/mailchimpQuotaService');
const { processScheduledImports } = require('../services/scheduledImportService');
const { ping } = require('../lib/mailchimpClient');

const ONE_HOUR_MS = 60 * 60 * 1000;
const TWO_MIN_MS = 2 * 60 * 1000;
const FIFTEEN_MIN_MS = 15 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_MIN_MS = 60 * 1000;

let reportHandle = null;
let syncHandle = null;
let retryHandle = null;
let scheduleHandle = null;
let reconcileHandle = null;

async function processMarketingSyncQueue() {
  const doc = await PlatformSettings.findById('global').lean();
  if (!doc?.mailchimp?.enabled) return { skipped: true };

  const leads = await Lead.find({
    consentStatus: { $in: ['opted_in', 'pending'] },
    $or: [{ mailchimpLastSyncAt: null }, { mailchimpSyncError: { $exists: true, $nin: [null, ''] } }],
  })
    .sort({ updatedAt: -1 })
    .limit(25)
    .select('_id')
    .lean();

  let synced = 0;
  let failed = 0;
  for (const row of leads) {
    const result = await syncLeadToMailchimp(row._id);
    if (result.success) synced += 1;
    else if (!result.skipped) failed += 1;
  }
  return { synced, failed, queued: leads.length };
}

async function retryFailedSyncJobs() {
  const doc = await PlatformSettings.findById('global').lean();
  if (!doc?.mailchimp?.enabled) return { skipped: true };

  const jobs = await MailchimpSyncJob.find({
    status: { $in: ['pending', 'failed'] },
    attempts: { $lt: 8 },
    nextRetryAt: { $lte: new Date() },
  })
    .sort({ nextRetryAt: 1 })
    .limit(20)
    .lean();

  let synced = 0;
  let failed = 0;
  for (const job of jobs) {
    await MailchimpSyncJob.updateOne({ _id: job._id }, { $set: { status: 'processing' } });
    const result = await syncLeadToMailchimp(job.leadId);
    if (result.success) {
      synced += 1;
      await MailchimpSyncJob.deleteOne({ _id: job._id });
    } else if (!result.skipped) {
      failed += 1;
      const delay = Math.min(3600000, 60000 * Math.pow(2, job.attempts || 0));
      await MailchimpSyncJob.updateOne(
        { _id: job._id },
        {
          $set: {
            status: 'failed',
            nextRetryAt: new Date(Date.now() + delay),
          },
          $inc: { attempts: 1 },
        },
      );
    }
  }
  return { synced, failed, jobs: jobs.length };
}

async function reconcileMailchimpMembers() {
  const doc = await PlatformSettings.findById('global').lean();
  if (!doc?.mailchimp?.enabled || !doc.mailchimp.defaultListId) return { skipped: true };

  const sample = await Lead.find({
    consentStatus: 'opted_in',
    mailchimpLastSyncAt: { $ne: null },
  })
    .sort({ updatedAt: -1 })
    .limit(40)
    .select('_id email mailchimpStatus')
    .lean();

  let checked = 0;
  for (const row of sample) {
    await syncLeadToMailchimp(row._id);
    checked += 1;
  }
  return { checked };
}

async function refreshSentCampaignReports() {
  const doc = await PlatformSettings.findById('global').lean();
  if (!doc?.mailchimp?.enabled) return { skipped: true };

  const campaigns = await MarketingCampaign.find({
    status: { $in: ['sent', 'sending'] },
    mailchimpCampaignId: { $ne: '' },
  })
    .sort({ updatedAt: -1 })
    .limit(30)
    .select('_id')
    .lean();

  let refreshed = 0;
  for (const c of campaigns) {
    try {
      await fetchAndCacheReport(c._id, { refresh: true });
      refreshed += 1;
    } catch {
      /* report may not exist yet */
    }
  }
  return { refreshed, total: campaigns.length };
}

async function runMailchimpHealthCheck() {
  const doc = await PlatformSettings.findById('global').lean();
  if (!doc?.mailchimp?.enabled || !doc?.mailchimp?.apiKeyEncrypted) return { skipped: true };
  try {
    await ping();
    await PlatformSettings.updateOne(
      { _id: 'global' },
      { $set: { 'mailchimp.lastHealthCheckAt': new Date() } },
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function startMarketingJobs() {
  if (reportHandle) return;

  const runReports = async () => {
    try {
      await refreshSentCampaignReports();
      await refreshAccountStatsCache();
      await runMailchimpHealthCheck();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[linkbio] marketing jobs failed:', err.message);
    }
  };

  const runSync = async () => {
    try {
      await processMarketingSyncQueue();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[linkbio] marketing sync queue failed:', err.message);
    }
  };

  const runRetry = async () => {
    try {
      await retryFailedSyncJobs();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[linkbio] marketing retry jobs failed:', err.message);
    }
  };

  const runScheduled = async () => {
    try {
      await processScheduledImports();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[linkbio] scheduled imports failed:', err.message);
    }
  };

  const runReconcile = async () => {
    try {
      await reconcileMailchimpMembers();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[linkbio] reconcile members failed:', err.message);
    }
  };

  runReports();
  runSync();
  runRetry();
  runScheduled();
  reportHandle = setInterval(runReports, ONE_HOUR_MS);
  syncHandle = setInterval(runSync, TWO_MIN_MS);
  retryHandle = setInterval(runRetry, FIFTEEN_MIN_MS);
  scheduleHandle = setInterval(runScheduled, ONE_MIN_MS);
  reconcileHandle = setInterval(runReconcile, ONE_DAY_MS);
  [reportHandle, syncHandle, retryHandle, scheduleHandle, reconcileHandle].forEach((h) => {
    if (h?.unref) h.unref();
  });
}

function stopMarketingJobs() {
  for (const h of [reportHandle, syncHandle, retryHandle, scheduleHandle, reconcileHandle]) {
    if (h) clearInterval(h);
  }
  reportHandle = null;
  syncHandle = null;
  retryHandle = null;
  scheduleHandle = null;
  reconcileHandle = null;
}

module.exports = {
  startMarketingJobs,
  stopMarketingJobs,
  refreshSentCampaignReports,
  runMailchimpHealthCheck,
  processMarketingSyncQueue,
  retryFailedSyncJobs,
  reconcileMailchimpMembers,
  refreshAccountStatsCache,
  processScheduledImports,
};
