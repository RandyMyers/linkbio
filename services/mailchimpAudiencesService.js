const { mailchimpRequest } = require('../lib/mailchimpClient');
const { getMailchimpSettings } = require('../lib/mailchimpSettings');
const { listMailchimpAudiences } = require('./mailchimpQuotaService');

async function resolveListId(listId) {
  const settings = await getMailchimpSettings();
  const id = listId || settings.defaultListId;
  if (!id) {
    const err = new Error('Mailchimp list ID is not configured.');
    err.statusCode = 400;
    throw err;
  }
  return id;
}

async function getAudienceDetail(listId) {
  const id = await resolveListId(listId);
  const list = await mailchimpRequest(`/lists/${id}?include_total_contacts=true`);
  return {
    id: list.id,
    name: list.name,
    dateCreated: list.date_created,
    stats: {
      memberCount: list.stats?.member_count ?? 0,
      totalContacts: list.stats?.total_contacts ?? 0,
      unsubscribeCount: list.stats?.unsubscribe_count ?? 0,
      cleanedCount: list.stats?.cleaned_count ?? 0,
      pendingCount: list.stats?.pending_count ?? 0,
    },
    campaignDefaults: list.campaign_defaults || {},
  };
}

async function listAudienceMembers(listId, { status = 'subscribed', count = 50, offset = 0 } = {}) {
  const id = await resolveListId(listId);
  const cap = Math.min(1000, Math.max(1, Number(count) || 50));
  const off = Math.max(0, Number(offset) || 0);
  const q = new URLSearchParams({
    count: String(cap),
    offset: String(off),
    ...(status ? { status: String(status) } : {}),
  });
  const data = await mailchimpRequest(`/lists/${id}/members?${q}`);
  const members = (data.members || []).map((m) => ({
    id: m.id,
    email: m.email_address,
    status: m.status,
    firstName: m.merge_fields?.FNAME || '',
    lastName: m.merge_fields?.LNAME || '',
    country: m.merge_fields?.COUNTRY || '',
    language: m.merge_fields?.LANGUAGE || '',
    stage: m.merge_fields?.STAGE || '',
    timestampOpt: m.timestamp_opt,
    lastChanged: m.last_changed,
  }));
  return { members, total: data.total_items ?? members.length };
}

async function getAudienceActivity(listId) {
  const id = await resolveListId(listId);
  const data = await mailchimpRequest(`/lists/${id}/activity`);
  const history = (data.history || []).map((row) => ({
    day: row.day,
    emailsSent: row.emails_sent ?? 0,
    uniqueOpens: row.unique_opens ?? 0,
    recipientClicks: row.recipient_clicks ?? 0,
    hardBounce: row.hard_bounce ?? 0,
    softBounce: row.soft_bounce ?? 0,
    subs: row.subs ?? 0,
    unsubs: row.unsubs ?? 0,
    otherAdds: row.other_adds ?? 0,
    otherRemoves: row.other_removes ?? 0,
  }));
  return { history };
}

async function listAudienceSegments(listId) {
  const id = await resolveListId(listId);
  const data = await mailchimpRequest(`/lists/${id}/segments?count=100`);
  const segments = (data.segments || []).map((s) => ({
    id: s.id,
    name: s.name,
    memberCount: s.member_count ?? 0,
    type: s.type,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  }));
  return { segments };
}

async function listAudienceTags(listId) {
  const id = await resolveListId(listId);
  const data = await mailchimpRequest(`/lists/${id}/tag-search?count=100`);
  const tags = (data.tags || []).map((t) => ({
    name: t.name,
    count: t.count ?? 0,
  }));
  return { tags };
}

module.exports = {
  listMailchimpAudiences,
  getAudienceDetail,
  listAudienceMembers,
  getAudienceActivity,
  listAudienceSegments,
  listAudienceTags,
};
