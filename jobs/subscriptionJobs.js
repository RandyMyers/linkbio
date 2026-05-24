const { syncSubscriptionRemindersForAllUsers } = require('../services/notificationService');
const { expireSubscriptions } = require('../lib/subscriptionLifecycle');
const { deliverPendingNotificationEmails } = require('../services/emailDelivery');
const { writeDailySnapshot } = require('../services/subscriptionAnalytics');

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
let reminderHandle = null;
let expiryHandle = null;

async function runSubscriptionReminderSync() {
  try {
    const result = await syncSubscriptionRemindersForAllUsers();
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.log('[linkbio] subscription reminders synced', result);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[linkbio] subscription reminder sync failed:', err.message);
  }
}

async function runSubscriptionExpiry() {
  try {
    const result = await expireSubscriptions();
    if (process.env.NODE_ENV === 'development' && result.processed > 0) {
      // eslint-disable-next-line no-console
      console.log('[linkbio] subscription expiry processed', result);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[linkbio] subscription expiry failed:', err.message);
  }
}

async function runEmailDelivery() {
  try {
    const result = await deliverPendingNotificationEmails();
    if (process.env.NODE_ENV === 'development' && result.sent > 0) {
      // eslint-disable-next-line no-console
      console.log('[linkbio] notification emails', result);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[linkbio] email delivery failed:', err.message);
  }
}

async function runDailySnapshot() {
  try {
    await writeDailySnapshot();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[linkbio] subscription snapshot failed:', err.message);
  }
}

function startSubscriptionJobs() {
  if (!reminderHandle) {
    runSubscriptionReminderSync();
    runEmailDelivery();
    runDailySnapshot();
    reminderHandle = setInterval(() => {
      runSubscriptionReminderSync();
      runEmailDelivery();
    }, SIX_HOURS_MS);
    if (reminderHandle.unref) reminderHandle.unref();
  }
  if (!expiryHandle) {
    runSubscriptionExpiry();
    expiryHandle = setInterval(runSubscriptionExpiry, ONE_HOUR_MS);
    if (expiryHandle.unref) expiryHandle.unref();
  }
}

function stopSubscriptionJobs() {
  if (reminderHandle) {
    clearInterval(reminderHandle);
    reminderHandle = null;
  }
  if (expiryHandle) {
    clearInterval(expiryHandle);
    expiryHandle = null;
  }
}

module.exports = {
  startSubscriptionJobs,
  stopSubscriptionJobs,
  runSubscriptionReminderSync,
  runSubscriptionExpiry,
};
