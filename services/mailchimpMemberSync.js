const { getMailchimpSettings } = require('../lib/mailchimpSettings');
const { upsertMember, mailchimpRequest } = require('../lib/mailchimpClient');
const { subscriberHash } = require('../lib/mailchimpSubscriberHash');
const Lead = require('../models/Lead');
const MailchimpSyncJob = require('../models/MailchimpSyncJob');
const { batchUpsertLeads } = require('./mailchimpBatchSync');

function mailchimpStatusForLead(lead, doubleOptIn) {
  if (lead.consentStatus === 'opted_out' || lead.consentStatus === 'cleaned') return 'unsubscribed';
  if (lead.consentStatus === 'pending' || doubleOptIn) return 'pending';
  return 'subscribed';
}

function leadToMailchimpMember(lead, { doubleOptIn, listId }) {
  const tags = (lead.tags || []).map((name) => ({ name, status: 'active' }));
  if (lead.country) tags.push({ name: `country:${lead.country}`, status: 'active' });
  if (lead.language) tags.push({ name: `lang:${lead.language}`, status: 'active' });
  if (lead.conversionStage) tags.push({ name: `stage:${lead.conversionStage}`, status: 'active' });

  return {
    email_address: lead.email,
    status_if_new: mailchimpStatusForLead(lead, doubleOptIn),
    status: mailchimpStatusForLead(lead, doubleOptIn),
    merge_fields: {
      FNAME: lead.firstName || lead.fullName?.split(' ')[0] || '',
      LNAME: lead.lastName || lead.fullName?.split(' ').slice(1).join(' ') || '',
      COUNTRY: lead.country || '',
      LANGUAGE: lead.language || '',
      PHONE: lead.phone || '',
      COMPANY: lead.company || '',
      STAGE: lead.conversionStage || 'lead',
    },
    tags,
  };
}

async function syncLeadToMailchimp(leadId) {
  const settings = await getMailchimpSettings();
  if (!settings.enabled || !settings.defaultListId) {
    return { skipped: true, reason: 'mailchimp_disabled' };
  }
  const lead = await Lead.findById(leadId);
  if (!lead) return { skipped: true, reason: 'not_found' };

  try {
    const body = leadToMailchimpMember(lead, {
      doubleOptIn: settings.doubleOptIn,
      listId: settings.defaultListId,
    });
    const result = await upsertMember(settings.defaultListId, body);
    lead.mailchimpListId = settings.defaultListId;
    lead.mailchimpStatus = result.status || body.status;
    lead.mailchimpLastSyncAt = new Date();
    lead.mailchimpSyncError = null;
    await lead.save();
    return { success: true, status: lead.mailchimpStatus };
  } catch (err) {
    lead.mailchimpSyncError = String(err.message || err).slice(0, 500);
    await lead.save();
    await MailchimpSyncJob.findOneAndUpdate(
      { leadId: lead._id },
      {
        $set: {
          status: 'failed',
          lastError: lead.mailchimpSyncError,
          nextRetryAt: new Date(Date.now() + 15 * 60 * 1000),
        },
        $inc: { attempts: 1 },
      },
      { upsert: true },
    );
    return { success: false, error: lead.mailchimpSyncError };
  }
}

async function syncLeadsBatch(leadIds) {
  if (leadIds.length > 10) {
    const batch = await batchUpsertLeads(leadIds);
    if (!batch.skipped) return { synced: batch.synced || 0, failed: batch.failed || 0, skipped: 0, batches: batch.batches };
  }
  const results = { synced: 0, failed: 0, skipped: 0 };
  for (const id of leadIds) {
    const r = await syncLeadToMailchimp(id);
    if (r.skipped) results.skipped += 1;
    else if (r.success) {
      results.synced += 1;
      await MailchimpSyncJob.deleteOne({ leadId: id });
    } else results.failed += 1;
  }
  return results;
}

async function deleteMemberPermanent(email, listId) {
  const settings = await getMailchimpSettings();
  const lid = listId || settings.defaultListId;
  if (!lid || !email) return { skipped: true };
  const hash = subscriberHash(email);
  await mailchimpRequest(`/lists/${lid}/members/${hash}/actions/delete-permanent`, { method: 'POST' });
  return { ok: true };
}

module.exports = {
  syncLeadToMailchimp,
  syncLeadsBatch,
  leadToMailchimpMember,
  deleteMemberPermanent,
};
