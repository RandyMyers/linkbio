const PaymentMethod = require('../models/PaymentMethod');
const { asyncHandler } = require('../middleware/errorHandler');

const SYSTEM_SLUGS = new Set(['bank_transfer', 'crypto']);

function serializeMethod(doc) {
  return {
    id: doc._id.toString(),
    slug: doc.slug,
    label: doc.label,
    description: doc.description || '',
    enabled: !!doc.enabled,
    sortOrder: doc.sortOrder ?? 0,
    config: doc.config && typeof doc.config === 'object' ? doc.config : {},
    currencies: doc.currencies || [],
    plans: doc.plans || [],
    isSystem: !!doc.isSystem,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

exports.listPaymentMethods = asyncHandler(async (req, res) => {
  const rows = await PaymentMethod.find({}).sort({ sortOrder: 1, slug: 1 }).lean();
  res.json({ methods: rows.map(serializeMethod) });
});

exports.createPaymentMethod = asyncHandler(async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const slug = String(body.slug || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]/g, '');
  if (!slug) {
    res.status(400).json({ error: 'slug is required' });
    return;
  }
  if (SYSTEM_SLUGS.has(slug)) {
    res.status(400).json({ error: 'Use PATCH to edit system payment methods' });
    return;
  }

  const exists = await PaymentMethod.findOne({ slug }).lean();
  if (exists) {
    res.status(409).json({ error: 'Slug already exists' });
    return;
  }

  const doc = await PaymentMethod.create({
    slug,
    label: String(body.label || slug).trim().slice(0, 120),
    description: String(body.description || '').trim().slice(0, 500),
    enabled: body.enabled !== false,
    sortOrder: Number(body.sortOrder) || 0,
    config: body.config && typeof body.config === 'object' ? body.config : {},
    currencies: Array.isArray(body.currencies) ? body.currencies.map((c) => String(c).toLowerCase()) : [],
    plans: Array.isArray(body.plans) ? body.plans.map((p) => String(p).toLowerCase()) : [],
    isSystem: false,
  });

  res.status(201).json({ method: serializeMethod(doc.toObject()) });
});

exports.patchPaymentMethod = asyncHandler(async (req, res) => {
  const slug = String(req.params.slug || '').toLowerCase().trim();
  const doc = await PaymentMethod.findOne({ slug });
  if (!doc) {
    res.status(404).json({ error: 'Payment method not found' });
    return;
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (body.label !== undefined) doc.label = String(body.label).trim().slice(0, 120);
  if (body.description !== undefined) doc.description = String(body.description).trim().slice(0, 500);
  if (body.enabled !== undefined) doc.enabled = !!body.enabled;
  if (body.sortOrder !== undefined) doc.sortOrder = Number(body.sortOrder) || 0;
  if (body.config !== undefined && typeof body.config === 'object') {
    doc.config = { ...(doc.config || {}), ...body.config };
  }
  if (body.currencies !== undefined) {
    doc.currencies = Array.isArray(body.currencies)
      ? body.currencies.map((c) => String(c).toLowerCase())
      : [];
  }
  if (body.plans !== undefined) {
    doc.plans = Array.isArray(body.plans) ? body.plans.map((p) => String(p).toLowerCase()) : [];
  }

  await doc.save();
  res.json({ method: serializeMethod(doc.toObject()) });
});

exports.deletePaymentMethod = asyncHandler(async (req, res) => {
  const slug = String(req.params.slug || '').toLowerCase().trim();
  if (SYSTEM_SLUGS.has(slug)) {
    res.status(400).json({ error: 'Cannot delete system payment methods' });
    return;
  }
  const doc = await PaymentMethod.findOneAndDelete({ slug, isSystem: { $ne: true } });
  if (!doc) {
    res.status(404).json({ error: 'Payment method not found' });
    return;
  }
  res.json({ ok: true });
});
