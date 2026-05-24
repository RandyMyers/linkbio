const config = require('../config');
const PlatformSettings = require('../models/PlatformSettings');
const { mailchimpRequest } = require('../lib/mailchimpClient');

async function getWebhookSecret() {
  const doc = await PlatformSettings.findById('global').lean();
  return doc?.mailchimp?.webhookSecret || '';
}

function webhookUrl(secret) {
  const base = (config.apiPublicUrl || `http://localhost:${config.port}`).replace(/\/$/, '');
  const token = secret || 'mailchimp';
  return `${base}/api/webhooks/mailchimp/${encodeURIComponent(token)}`;
}

async function registerListWebhook({ listId, secret } = {}) {
  const doc = await PlatformSettings.findById('global').lean();
  const mc = doc?.mailchimp || {};
  const targetList = listId || mc.defaultListId;
  if (!targetList) {
    const err = new Error('Default Mailchimp list ID is not configured.');
    err.statusCode = 400;
    throw err;
  }

  const webhookSecret = secret || mc.webhookSecret || '';
  const url = webhookUrl(webhookSecret);

  const existing = await mailchimpRequest(`/lists/${targetList}/webhooks?count=100`);
  const match = (existing.webhooks || []).find((w) => w.url === url);
  if (match) {
    return { url, webhookId: match.id, listId: targetList, alreadyRegistered: true };
  }

  const created = await mailchimpRequest(`/lists/${targetList}/webhooks`, {
    method: 'POST',
    body: {
      url,
      events: {
        subscribe: true,
        unsubscribe: true,
        cleaned: true,
        profile: true,
        upemail: false,
        campaign: false,
      },
      sources: {
        user: true,
        admin: true,
        api: true,
      },
    },
  });

  return { url, webhookId: created.id, listId: targetList, alreadyRegistered: false };
}

module.exports = {
  getWebhookSecret,
  webhookUrl,
  registerListWebhook,
};
