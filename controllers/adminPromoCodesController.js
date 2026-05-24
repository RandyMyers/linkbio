const PromoCode = require('../models/PromoCode');
const { asyncHandler } = require('../middleware/errorHandler');

function serialize(row) {
  return {
    id: row._id.toString(),
    code: row.code,
    label: row.label || '',
    discountType: row.discountType,
    discountValue: row.discountValue,
    currency: row.currency || 'usd',
    planSlugs: row.planSlugs || [],
    billingIntervals: row.billingIntervals || [],
    maxRedemptions: row.maxRedemptions,
    redemptionCount: row.redemptionCount || 0,
    validFrom: row.validFrom ? new Date(row.validFrom).toISOString() : null,
    validUntil: row.validUntil ? new Date(row.validUntil).toISOString() : null,
    active: !!row.active,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
  };
}

exports.listPromoCodes = asyncHandler(async (_req, res) => {
  const rows = await PromoCode.find().sort({ createdAt: -1 }).limit(200).lean();
  res.json({ promoCodes: rows.map(serialize) });
});

exports.createPromoCode = asyncHandler(async (req, res) => {
  const code = String(req.body.code || '')
    .trim()
    .toUpperCase();
  if (!code) {
    res.status(400).json({ error: 'code is required' });
    return;
  }

  const discountType = req.body.discountType === 'amount' ? 'amount' : 'percent';
  const discountValue = Number(req.body.discountValue);
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    res.status(400).json({ error: 'discountValue must be positive' });
    return;
  }

  const doc = await PromoCode.create({
    code,
    label: String(req.body.label || '').slice(0, 120),
    discountType,
    discountValue,
    currency: String(req.body.currency || 'usd').toLowerCase(),
    planSlugs: Array.isArray(req.body.planSlugs) ? req.body.planSlugs.map(String) : [],
    billingIntervals: Array.isArray(req.body.billingIntervals)
      ? req.body.billingIntervals.map(String)
      : [],
    maxRedemptions:
      req.body.maxRedemptions != null && req.body.maxRedemptions !== ''
        ? Number(req.body.maxRedemptions)
        : null,
    validFrom: req.body.validFrom ? new Date(req.body.validFrom) : null,
    validUntil: req.body.validUntil ? new Date(req.body.validUntil) : null,
    active: req.body.active !== false,
  });

  res.status(201).json({ promoCode: serialize(doc) });
});

exports.patchPromoCode = asyncHandler(async (req, res) => {
  const doc = await PromoCode.findById(req.params.id);
  if (!doc) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  if (req.body.active !== undefined) doc.active = !!req.body.active;
  if (req.body.label !== undefined) doc.label = String(req.body.label).slice(0, 120);
  if (req.body.maxRedemptions !== undefined) {
    doc.maxRedemptions =
      req.body.maxRedemptions === null || req.body.maxRedemptions === ''
        ? null
        : Number(req.body.maxRedemptions);
  }
  if (req.body.validUntil !== undefined) {
    doc.validUntil = req.body.validUntil ? new Date(req.body.validUntil) : null;
  }

  await doc.save();
  res.json({ promoCode: serialize(doc) });
});
