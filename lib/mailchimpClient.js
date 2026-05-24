const { getMailchimpApiKey, getMailchimpSettings } = require('./mailchimpSettings');

let activeRequests = 0;
const MAX_CONCURRENT = 8;
const queue = [];

function acquireSlot() {
  return new Promise((resolve) => {
    if (activeRequests < MAX_CONCURRENT) {
      activeRequests += 1;
      resolve();
      return;
    }
    queue.push(resolve);
  });
}

function releaseSlot() {
  activeRequests = Math.max(0, activeRequests - 1);
  const next = queue.shift();
  if (next) {
    activeRequests += 1;
    next();
  }
}

async function mailchimpRequest(path, { method = 'GET', body } = {}) {
  const settings = await getMailchimpSettings();
  const apiKey = await getMailchimpApiKey();
  if (!settings.enabled || !apiKey) {
    const err = new Error('Mailchimp is not configured.');
    err.statusCode = 400;
    err.code = 'MAILCHIMP_NOT_CONFIGURED';
    throw err;
  }
  const dc = settings.serverPrefix || apiKey.split('-').pop();
  const url = `https://${dc}.api.mailchimp.com/3.0${path.startsWith('/') ? path : `/${path}`}`;

  await acquireSlot();
  try {
    const auth = Buffer.from(`anystring:${apiKey}`).toString('base64');
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      const err = new Error(data?.detail || data?.title || data?.error || `Mailchimp ${res.status}`);
      err.statusCode = res.status;
      err.body = data;
      throw err;
    }
    return data;
  } finally {
    releaseSlot();
  }
}

async function ping() {
  const apiKey = await getMailchimpApiKey();
  const settings = await getMailchimpSettings();
  if (!apiKey) {
    const err = new Error('Mailchimp API key not set.');
    err.statusCode = 400;
    throw err;
  }
  const dc = settings.serverPrefix || apiKey.split('-').pop();
  const url = `https://${dc}.api.mailchimp.com/3.0/ping`;
  const auth = Buffer.from(`anystring:${apiKey}`).toString('base64');
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || 'Mailchimp ping failed');
  return data;
}

async function getRoot() {
  return mailchimpRequest('/');
}

async function upsertMember(listId, member) {
  const { subscriberHash } = require('./mailchimpSubscriberHash');
  const hash = subscriberHash(member.email_address);
  return mailchimpRequest(`/lists/${listId}/members/${hash}`, { method: 'PUT', body: member });
}

module.exports = {
  mailchimpRequest,
  ping,
  getRoot,
  upsertMember,
};
