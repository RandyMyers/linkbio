const { mailchimpRequest } = require('../lib/mailchimpClient');
const { getMailchimpSettings } = require('../lib/mailchimpSettings');

async function searchMembers(query, { count = 25 } = {}) {
  const q = String(query || '').trim();
  if (!q) return { members: [], total: 0 };

  const settings = await getMailchimpSettings();
  const cap = Math.min(50, Math.max(1, Number(count) || 25));
  const params = new URLSearchParams({
    query: q,
    count: String(cap),
    ...(settings.defaultListId ? { list_id: settings.defaultListId } : {}),
  });

  const data = await mailchimpRequest(`/search-members?${params}`);
  const members = (data.exact_matches?.members || data.full_search?.members || data.members || []).map(
    (m) => ({
      id: m.id,
      email: m.email_address,
      listId: m.list_id,
      status: m.status,
      firstName: m.merge_fields?.FNAME || '',
      lastName: m.merge_fields?.LNAME || '',
      country: m.merge_fields?.COUNTRY || '',
      language: m.merge_fields?.LANGUAGE || '',
    }),
  );

  return { members, total: data.total_items ?? members.length };
}

module.exports = { searchMembers };
