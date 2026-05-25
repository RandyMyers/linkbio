const Lead = require('../models/Lead');
const { getMailchimpSettings } = require('../lib/mailchimpSettings');
const { subscriberHash } = require('../lib/mailchimpSubscriberHash');
const { createLead, updateLead } = require('./leadService');
const { syncLeadToMailchimp } = require('./mailchimpMemberSync');

function splitName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

async function shouldAutoSyncSignups() {
  const mc = await getMailchimpSettings();
  return !!mc.enabled && !!mc.autoSyncSignups;
}

async function shouldAutoSyncSubscribers() {
  const mc = await getMailchimpSettings();
  return !!mc.enabled && !!mc.autoSyncSubscribers;
}

/**
 * Upsert marketing lead from LinkBio user signup (non-blocking).
 */
async function syncLeadFromSignup({ email, name, subscriptionPlan }) {
  if (!(await shouldAutoSyncSignups())) return { skipped: true, reason: 'disabled' };
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return { skipped: true, reason: 'no_email' };

  const { firstName, lastName } = splitName(name);
  const stage = subscriptionPlan && subscriptionPlan !== 'free' ? 'trial' : 'lead';
  const existing = await Lead.findOne({ email: normalized });

  let lead;
  if (existing) {
    lead = await updateLead(
      existing._id,
      {
        firstName: firstName || existing.firstName,
        lastName: lastName || existing.lastName,
        conversionStage: stage,
        sourceLabel: existing.sourceLabel || 'linkbio_signup',
        tags: [...new Set([...(existing.tags || []), 'source:linkbio', 'type:creator'])],
      },
      { source: 'api_signup' },
    );
  } else {
    lead = await createLead(
      {
        email: normalized,
        firstName,
        lastName,
        conversionStage: stage,
        consentStatus: 'opted_in',
        sourceLabel: 'linkbio_signup',
        tags: ['source:linkbio', 'type:creator'],
      },
      { source: 'api_signup' },
    );
  }

  syncLeadToMailchimp(lead.id).catch(() => {});
  return { synced: true, leadId: lead.id };
}

/**
 * Upsert marketing lead from public newsletter block subscribe.
 */
async function syncLeadFromNewsletterSubscriber({ email, name, username }) {
  if (!(await shouldAutoSyncSubscribers())) return { skipped: true, reason: 'disabled' };
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return { skipped: true, reason: 'no_email' };

  const { firstName, lastName } = splitName(name);
  const existing = await Lead.findOne({ email: normalized });
  const tags = [`source:newsletter`, `bio:${username || ''}`].filter(Boolean);

  let lead;
  if (existing) {
    lead = await updateLead(
      existing._id,
      {
        firstName: firstName || existing.firstName,
        lastName: lastName || existing.lastName,
        consentStatus: 'opted_in',
        tags: [...new Set([...(existing.tags || []), ...tags])],
        sourceLabel: existing.sourceLabel || `newsletter:${username}`,
      },
      { source: 'api_subscriber' },
    );
  } else {
    lead = await createLead(
      {
        email: normalized,
        firstName,
        lastName,
        consentStatus: 'opted_in',
        sourceLabel: `newsletter:${username}`,
        tags,
      },
      { source: 'api_subscriber' },
    );
  }

  syncLeadToMailchimp(lead.id).catch(() => {});
  return { synced: true, leadId: lead.id };
}

/**
 * When a creator activates a paid LinkBio plan, upsert lead as paid (if enabled).
 */
async function syncLeadFromPaidUser(user) {
  const mc = await getMailchimpSettings();
  if (!mc.enabled || !mc.autoSyncPaidSubscribers) {
    return { skipped: true, reason: 'disabled' };
  }
  const normalized = String(user?.email || '').trim().toLowerCase();
  if (!normalized) return { skipped: true, reason: 'no_email' };

  const plan = String(user.subscriptionPlan || '').toLowerCase();
  if (!plan || plan === 'free') return { skipped: true, reason: 'free_plan' };

  const { firstName, lastName } = splitName(user.name);
  const existing = await Lead.findOne({ email: normalized });

  let lead;
  if (existing) {
    lead = await updateLead(
      existing._id,
      {
        firstName: firstName || existing.firstName,
        lastName: lastName || existing.lastName,
        conversionStage: 'paid',
        tags: [...new Set([...(existing.tags || []), 'source:linkbio', 'type:creator', `plan:${plan}`])],
      },
      { source: 'billing_paid' },
    );
  } else {
    lead = await createLead(
      {
        email: normalized,
        firstName,
        lastName,
        conversionStage: 'paid',
        consentStatus: 'opted_in',
        sourceLabel: 'linkbio_billing',
        tags: ['source:linkbio', 'type:creator', `plan:${plan}`],
      },
      { source: 'billing_paid' },
    );
  }

  syncLeadToMailchimp(lead.id).catch(() => {});
  return { synced: true, leadId: lead.id };
}

module.exports = {
  syncLeadFromSignup,
  syncLeadFromNewsletterSubscriber,
  syncLeadFromPaidUser,
  shouldAutoSyncSignups,
  shouldAutoSyncSubscribers,
};
