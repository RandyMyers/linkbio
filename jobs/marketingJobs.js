const MarketingCampaign = require('../models/MarketingCampaign');
const { fetchAndCacheReport } = require('../services/mailchimpReportService');
const PlatformSettings = require('../models/PlatformSettings');
const { ping } = require('../lib/mailchimpClient');

const ONE_HOUR_MS = 60 * 60 * 1000;
let reportHandle = null;

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

  const run = async () => {
    try {
      await refreshSentCampaignReports();
      await runMailchimpHealthCheck();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[linkbio] marketing jobs failed:', err.message);
    }
  };

  run();
  reportHandle = setInterval(run, ONE_HOUR_MS);
  if (reportHandle.unref) reportHandle.unref();
}

function stopMarketingJobs() {
  if (reportHandle) {
    clearInterval(reportHandle);
    reportHandle = null;
  }
}

module.exports = {
  startMarketingJobs,
  stopMarketingJobs,
  refreshSentCampaignReports,
  runMailchimpHealthCheck,
};
