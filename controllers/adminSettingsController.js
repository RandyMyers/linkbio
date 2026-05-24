const PlatformSettings = require('../models/PlatformSettings');
const { VALID_BILLING_INTERVALS } = require('../lib/billingIntervals');
const { VALID_CURRENCIES } = require('../lib/currencies');
const { asyncHandler } = require('../middleware/errorHandler');

function serializeSettings(doc) {
  const d = doc || {};
  return {
    billingEnabled: d.billingEnabled !== false,
    defaultCurrency: d.defaultCurrency || 'usd',
    supportedCurrencies: d.supportedCurrencies?.length ? d.supportedCurrencies : VALID_CURRENCIES,
    supportedIntervals: d.supportedIntervals?.length ? d.supportedIntervals : VALID_BILLING_INTERVALS,
    maintenanceMessage: d.maintenanceMessage || '',
    gatewayRuntimeMode: d.gatewayRuntimeMode === 'production' ? 'production' : 'sandbox',
    subscriptionGraceDays: Math.max(0, Math.min(30, Number(d.subscriptionGraceDays) || 0)),
    updatedAt: d.updatedAt || null,
    updatedBy: d.updatedBy || '',
  };
}

exports.getSettings = asyncHandler(async (req, res) => {
  const doc = await PlatformSettings.findById('global').lean();
  res.json({ settings: serializeSettings(doc) });
});

exports.patchSettings = asyncHandler(async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const updates = {};

  if (body.billingEnabled !== undefined) updates.billingEnabled = !!body.billingEnabled;
  if (body.defaultCurrency !== undefined) {
    const c = String(body.defaultCurrency).toLowerCase().trim();
    if (!VALID_CURRENCIES.includes(c)) {
      res.status(400).json({ error: `defaultCurrency must be one of: ${VALID_CURRENCIES.join(', ')}` });
      return;
    }
    updates.defaultCurrency = c;
  }
  if (body.supportedCurrencies !== undefined) {
    const list = Array.isArray(body.supportedCurrencies)
      ? body.supportedCurrencies.map((x) => String(x).toLowerCase().trim())
      : [];
    const invalid = list.filter((c) => !VALID_CURRENCIES.includes(c));
    if (invalid.length) {
      res.status(400).json({ error: `Invalid currencies: ${invalid.join(', ')}` });
      return;
    }
    updates.supportedCurrencies = list.length ? list : VALID_CURRENCIES;
  }
  if (body.supportedIntervals !== undefined) {
    const list = Array.isArray(body.supportedIntervals)
      ? body.supportedIntervals.map((x) => String(x).toLowerCase().trim())
      : [];
    const invalid = list.filter((iv) => !VALID_BILLING_INTERVALS.includes(iv));
    if (invalid.length) {
      res.status(400).json({ error: `Invalid intervals: ${invalid.join(', ')}` });
      return;
    }
    updates.supportedIntervals = list.length ? list : VALID_BILLING_INTERVALS;
  }
  if (body.maintenanceMessage !== undefined) {
    updates.maintenanceMessage = String(body.maintenanceMessage).trim().slice(0, 2000);
  }
  if (body.gatewayRuntimeMode !== undefined) {
    updates.gatewayRuntimeMode =
      body.gatewayRuntimeMode === 'production' ? 'production' : 'sandbox';
  }
  if (body.subscriptionGraceDays !== undefined) {
    const days = Number(body.subscriptionGraceDays);
    if (Number.isNaN(days) || days < 0 || days > 30) {
      res.status(400).json({ error: 'subscriptionGraceDays must be 0–30' });
      return;
    }
    updates.subscriptionGraceDays = days;
  }

  updates.updatedBy = req.userEmail || 'admin';

  const doc = await PlatformSettings.findOneAndUpdate(
    { _id: 'global' },
    { $set: updates },
    { upsert: true, new: true },
  ).lean();

  res.json({ settings: serializeSettings(doc) });
});
