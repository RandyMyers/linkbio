const Lead = require('../models/Lead');
const LeadConversionEvent = require('../models/LeadConversionEvent');
const PlatformSettings = require('../models/PlatformSettings');
const { asyncHandler } = require('../middleware/errorHandler');
const { getWebhookSecret } = require('../services/mailchimpWebhookService');

async function verifySecret(req) {
  const expected = await getWebhookSecret();
  if (!expected) return true;
  return String(req.params.secret || '') === expected;
}

/** Mailchimp list webhook — consent sync back to Lead */
exports.handleWebhook = asyncHandler(async (req, res) => {
  if (!(await verifySecret(req))) {
    res.status(403).send('Forbidden');
    return;
  }

  const type = req.body?.type;
  const data = req.body?.data || {};
  const email = String(data.email || data.new_email || '').trim().toLowerCase();

  if (!email) {
    res.status(200).send('OK');
    return;
  }

  if (type === 'unsubscribe' || type === 'cleaned') {
    const lead = await Lead.findOne({ email });
    if (lead) {
      lead.consentStatus = type === 'cleaned' ? 'cleaned' : 'opted_out';
      lead.optedOutAt = new Date();
      lead.mailchimpStatus = type === 'cleaned' ? 'cleaned' : 'unsubscribed';
      await lead.save();
    }
  }

  if (type === 'subscribe') {
    const lead = await Lead.findOne({ email });
    if (lead) {
      lead.consentStatus = 'opted_in';
      lead.optedOutAt = null;
      lead.mailchimpStatus = 'subscribed';
      if (!lead.consentAt) lead.consentAt = new Date();
      await lead.save();
    }
  }

  if (type === 'profile' && data.merges) {
    const lead = await Lead.findOne({ email });
    if (lead) {
      const m = data.merges;
      if (m.FNAME) lead.firstName = m.FNAME;
      if (m.LNAME) lead.lastName = m.LNAME;
      if (m.COUNTRY) lead.country = String(m.COUNTRY).toUpperCase().slice(0, 2);
      if (m.LANGUAGE) lead.language = String(m.LANGUAGE).toLowerCase().slice(0, 2);
      if (m.STAGE && m.STAGE !== lead.conversionStage) {
        const before = lead.conversionStage;
        lead.conversionStage = m.STAGE;
        if (m.STAGE === 'paid' && !lead.convertedAt) lead.convertedAt = new Date();
        await lead.save();
        await LeadConversionEvent.create({
          leadId: lead._id,
          fromStage: before,
          toStage: m.STAGE,
          source: 'mailchimp_webhook',
        });
      } else {
        await lead.save();
      }
    }
  }

  if (type === 'upemail' && data.old_email && data.new_email) {
    const oldEmail = String(data.old_email).trim().toLowerCase();
    const newEmail = String(data.new_email).trim().toLowerCase();
    const lead = await Lead.findOne({ email: oldEmail });
    if (lead) {
      lead.email = newEmail;
      await lead.save();
    }
  }

  res.status(200).send('OK');
});

exports.validateWebhook = asyncHandler(async (req, res) => {
  if (!(await verifySecret(req))) {
    res.status(403).send('Forbidden');
    return;
  }
  res.send(req.query.code || 'OK');
});

exports.getWebhookInfo = asyncHandler(async (_req, res) => {
  const secret = await getWebhookSecret();
  const { webhookUrl } = require('../services/mailchimpWebhookService');
  res.json({
    url: webhookUrl(secret),
    hasSecret: Boolean(secret),
  });
});
