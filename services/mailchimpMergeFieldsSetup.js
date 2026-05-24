const { mailchimpRequest } = require('../lib/mailchimpClient');
const { getMailchimpSettings } = require('../lib/mailchimpSettings');
const PlatformSettings = require('../models/PlatformSettings');

const REQUIRED_FIELDS = [
  { tag: 'COUNTRY', name: 'Country', type: 'text' },
  { tag: 'LANGUAGE', name: 'Language', type: 'text' },
  { tag: 'PHONE', name: 'Phone', type: 'phone' },
  { tag: 'COMPANY', name: 'Company', type: 'text' },
  { tag: 'STAGE', name: 'Conversion stage', type: 'text' },
  { tag: 'IMPORT_ID', name: 'Import batch', type: 'text' },
];

async function provisionMergeFields() {
  const settings = await getMailchimpSettings();
  const listId = settings.defaultListId;
  if (!listId) {
    const err = new Error('Default Mailchimp list ID is not configured.');
    err.statusCode = 400;
    throw err;
  }

  const existing = await mailchimpRequest(`/lists/${listId}/merge-fields?count=100`);
  const byTag = new Map((existing.merge_fields || []).map((f) => [f.tag, f]));
  const created = [];
  const skipped = [];

  for (const field of REQUIRED_FIELDS) {
    if (byTag.has(field.tag)) {
      skipped.push(field.tag);
      continue;
    }
    await mailchimpRequest(`/lists/${listId}/merge-fields`, {
      method: 'POST',
      body: {
        tag: field.tag,
        name: field.name,
        type: field.type,
        public: false,
      },
    });
    created.push(field.tag);
  }

  await PlatformSettings.updateOne(
    { _id: 'global' },
    { $set: { 'mailchimp.mergeFieldsProvisioned': true } },
  );

  return { listId, created, skipped };
}

module.exports = { provisionMergeFields, REQUIRED_FIELDS };
