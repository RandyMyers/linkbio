const { getMailchimpSettings } = require('../lib/mailchimpSettings');
const { upsertMember } = require('../lib/mailchimpClient');
const Lead = require('../models/Lead');

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
    return { success: false, error: lead.mailchimpSyncError };
  }
}

async function syncLeadsBatch(leadIds) {
  const results = { synced: 0, failed: 0, skipped: 0 };
  for (const id of leadIds) {
    const r = await syncLeadToMailchimp(id);
    if (r.skipped) results.skipped += 1;
    else if (r.success) results.synced += 1;
    else results.failed += 1;
  }
  return results;
}

module.exports = { syncLeadToMailchimp, syncLeadsBatch, leadToMailchimpMember };
