const { mailchimpRequest } = require('../lib/mailchimpClient');
const { getMailchimpSettings } = require('../lib/mailchimpSettings');
const { subscriberHash } = require('../lib/mailchimpSubscriberHash');
const Lead = require('../models/Lead');
const { leadToMailchimpMember } = require('./mailchimpMemberSync');

const BATCH_SIZE = 500;

/**
 * Queue member upserts via Mailchimp Batch API (POST /batches).
 */
async function batchUpsertLeads(leadIds) {
  const settings = await getMailchimpSettings();
  if (!settings.enabled || !settings.defaultListId) {
    return { skipped: true, reason: 'mailchimp_disabled' };
  }

  const listId = settings.defaultListId;
  const ids = [...new Set(leadIds)].slice(0, 5000);
  const leads = await Lead.find({ _id: { $in: ids } });
  if (!leads.length) return { synced: 0, batches: 0 };

  let synced = 0;
  let batches = 0;

  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const chunk = leads.slice(i, i + BATCH_SIZE);
    const operations = chunk.map((lead) => {
      const body = leadToMailchimpMember(lead, {
        doubleOptIn: settings.doubleOptIn,
        listId,
      });
      const hash = subscriberHash(lead.email);
      return {
        method: 'PUT',
        path: `/lists/${listId}/members/${hash}`,
        body: JSON.stringify(body),
      };
    });

    try {
      const result = await mailchimpRequest('/batches', {
        method: 'POST',
        body: { operations },
      });
      batches += 1;
      synced += chunk.length;
      for (const lead of chunk) {
        lead.mailchimpListId = listId;
        lead.mailchimpLastSyncAt = new Date();
        lead.mailchimpSyncError = null;
        lead.mailchimpStatus = lead.consentStatus === 'opted_out' ? 'unsubscribed' : 'subscribed';
      }
      await Promise.all(chunk.map((l) => l.save()));
      if (result?.id) {
        /* batch processes async on Mailchimp side */
      }
    } catch (err) {
      for (const lead of chunk) {
        lead.mailchimpSyncError = String(err.message || err).slice(0, 500);
        await lead.save();
      }
      return { synced, batches, failed: chunk.length, error: err.message };
    }
  }

  return { synced, batches };
}

module.exports = { batchUpsertLeads, BATCH_SIZE };
