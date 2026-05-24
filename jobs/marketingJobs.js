const MarketingCampaign = require('../models/MarketingCampaign');
const Lead = require('../models/Lead');
const { fetchAndCacheReport } = require('../services/mailchimpReportService');
const PlatformSettings = require('../models/PlatformSettings');
const { syncLeadToMailchimp } = require('../services/mailchimpMemberSync');
const { ping } = require('../lib/mailchimpClient');

const ONE_HOUR_MS = 60 * 60 * 1000;
const TWO_MIN_MS = 2 * 60 * 1000;
let reportHandle = null;
let syncHandle = null;

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

async function refreshSentCampaignReports() {  const doc = await PlatformSettings.findById('global').lean();
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

  runReports();
  runSync();
  reportHandle = setInterval(runReports, ONE_HOUR_MS);
  syncHandle = setInterval(runSync, TWO_MIN_MS);
  if (reportHandle.unref) reportHandle.unref();
  if (syncHandle.unref) syncHandle.unref();
}

function stopMarketingJobs() {
  if (reportHandle) {
    clearInterval(reportHandle);
    reportHandle = null;
  }
  if (syncHandle) {
    clearInterval(syncHandle);
    syncHandle = null;
  }
}

module.exports = {
  startMarketingJobs,
  stopMarketingJobs,
  refreshSentCampaignReports,
  runMailchimpHealthCheck,
  processMarketingSyncQueue,
};
