const { mailchimpRequest } = require('../lib/mailchimpClient');
const { getMailchimpSettings } = require('../lib/mailchimpSettings');
const { buildLeadFilter } = require('./leadService');
const Lead = require('../models/Lead');

const MEMBER_CHUNK = 500;

/**
 * Create a Mailchimp static segment from current lead CRM filters.
 */
async function createSegmentFromLeadFilters({ name, filter = {}, listId } = {}) {
  const settings = await getMailchimpSettings();
  const lid = listId || settings.defaultListId;
  if (!settings.enabled || !lid) {
    const err = new Error('Mailchimp list is not configured.');
    err.statusCode = 400;
    throw err;
  }

  const query = buildLeadFilter(filter);
  if (!query.consentStatus) query.consentStatus = 'opted_in';

  const leads = await Lead.find(query).select('email').limit(5000).lean();
  const emails = leads.map((l) => l.email).filter(Boolean);
  if (!emails.length) {
    const err = new Error('No leads match these filters.');
    err.statusCode = 400;
    throw err;
  }

  const segmentName = String(name || 'LinkBio segment').trim().slice(0, 100);
  const created = await mailchimpRequest(`/lists/${lid}/segments`, {
    method: 'POST',
    body: {
      name: segmentName,
      static_segment: emails.slice(0, MEMBER_CHUNK),
    },
  });

  const segmentId = created.id;
  for (let i = MEMBER_CHUNK; i < emails.length; i += MEMBER_CHUNK) {
    await mailchimpRequest(`/lists/${lid}/segments/${segmentId}`, {
      method: 'POST',
      body: { members_to_add: emails.slice(i, i + MEMBER_CHUNK) },
    });
  }

  return {
    segment: {
      id: segmentId,
      name: created.name,
      memberCount: emails.length,
      listId: lid,
    },
  };
}

module.exports = { createSegmentFromLeadFilters };
