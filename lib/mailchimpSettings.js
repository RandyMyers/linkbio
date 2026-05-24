const config = require('../config');
const PlatformSettings = require('../models/PlatformSettings');
const { decryptSecret, encryptSecret, maskSecret, last4FromPlain } = require('./secretCrypto');

async function getMailchimpSettings() {
  const doc = await PlatformSettings.findById('global').lean();
  return doc?.mailchimp || {};
}

async function getMailchimpApiKey() {
  const mc = await getMailchimpSettings();
  if (!mc.apiKeyEncrypted || !config.secretsMasterKey) return null;
  try {
    return decryptSecret(
      {
        encryptedValue: mc.apiKeyEncrypted,
        iv: mc.apiKeyIv,
        authTag: mc.apiKeyAuthTag,
      },
      config.secretsMasterKey,
    );
  } catch {
    return null;
  }
}

function serverPrefixFromApiKey(apiKey) {
  const parts = String(apiKey || '').split('-');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

function serializeMailchimpSettings(mc = {}) {
  return {
    enabled: !!mc.enabled,
    configured: Boolean(mc.apiKeyEncrypted),
    apiKeyLast4: mc.apiKeyLast4 || '',
    serverPrefix: mc.serverPrefix || '',
    defaultListId: mc.defaultListId || '',
    fromName: mc.fromName || '',
    fromEmail: mc.fromEmail || '',
    replyTo: mc.replyTo || '',
    doubleOptIn: !!mc.doubleOptIn,
    contactLimit: Number(mc.contactLimit) || 0,
    webhookSecret: mc.webhookSecret ? '••••••••' : '',
    mergeFieldsProvisioned: !!mc.mergeFieldsProvisioned,
    conversionStages: mc.conversionStages?.length
      ? mc.conversionStages
      : ['lead', 'contacted', 'qualified', 'trial', 'paid', 'churned'],
    supportedLanguages: mc.supportedLanguages?.length
      ? mc.supportedLanguages
      : ['en', 'fr', 'es', 'de', 'pt'],
    lastHealthCheckAt: mc.lastHealthCheckAt || null,
  };
}

async function patchMailchimpSettings(updates, { apiKeyPlain } = {}) {
  const set = { ...updates };
  if (apiKeyPlain !== undefined) {
    if (apiKeyPlain === '' || apiKeyPlain === null) {
      set['mailchimp.apiKeyEncrypted'] = '';
      set['mailchimp.apiKeyIv'] = '';
      set['mailchimp.apiKeyAuthTag'] = '';
      set['mailchimp.apiKeyLast4'] = '';
    } else if (config.secretsMasterKey) {
      const enc = encryptSecret(String(apiKeyPlain).trim(), config.secretsMasterKey);
      set['mailchimp.apiKeyEncrypted'] = enc.encryptedValue;
      set['mailchimp.apiKeyIv'] = enc.iv;
      set['mailchimp.apiKeyAuthTag'] = enc.authTag;
      set['mailchimp.apiKeyLast4'] = last4FromPlain(apiKeyPlain);
      const prefix = serverPrefixFromApiKey(apiKeyPlain);
      if (prefix) set['mailchimp.serverPrefix'] = prefix;
    }
  }
  const flat = {};
  for (const [k, v] of Object.entries(set)) {
    if (k.startsWith('mailchimp.')) flat[k] = v;
    else flat[`mailchimp.${k}`] = v;
  }
  const doc = await PlatformSettings.findOneAndUpdate(
    { _id: 'global' },
    { $set: flat },
    { upsert: true, new: true },
  ).lean();
  return serializeMailchimpSettings(doc.mailchimp);
}

module.exports = {
  getMailchimpSettings,
  getMailchimpApiKey,
  serverPrefixFromApiKey,
  serializeMailchimpSettings,
  patchMailchimpSettings,
};
