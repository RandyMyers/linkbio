const CryptoPayment = require('../models/CryptoPayment');
const { isPaidStatus } = require('../lib/nowpaymentsIpn');
const { activateUserSubscription } = require('../lib/subscriptionActivation');
const { normalizeInterval } = require('../lib/billingIntervals');
const { asyncHandler } = require('../middleware/errorHandler');

const PAID_STATUSES = ['finished', 'confirmed'];

function serializeRow(row) {
  const user = row.userId && typeof row.userId === 'object' ? row.userId : null;
  return {
    id: row._id.toString(),
    orderId: row.orderId,
    userId: user?._id?.toString() || (row.userId ? String(row.userId) : ''),
    userEmail: user?.email || '',
    userName: user?.name || '',
    type: row.type,
    planSlug: row.planSlug || '',
    billingInterval: normalizeInterval(row.billingInterval),
    productId: row.productId || '',
    username: row.username || '',
    priceAmount: row.priceAmount,
    priceCurrency: row.priceCurrency || 'usd',
    paymentStatus: row.paymentStatus,
    invoiceUrl: row.invoiceUrl || '',
    nowpaymentsInvoiceId: row.nowpaymentsInvoiceId || '',
    nowpaymentsPaymentId: row.nowpaymentsPaymentId || '',
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}

exports.listCryptoPayments = asyncHandler(async (req, res) => {
  const status = req.query.status ? String(req.query.status).toLowerCase() : '';
  const type = req.query.type ? String(req.query.type).toLowerCase() : '';
  const q = String(req.query.q || '').trim();
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const skip = (page - 1) * limit;

  const filter = {};
  if (type === 'subscription' || type === 'product') filter.type = type;
  if (status === 'waiting') {
    filter.paymentStatus = { $nin: PAID_STATUSES };
  } else if (status === 'paid') {
    filter.paymentStatus = { $in: PAID_STATUSES };
  } else if (status) {
    filter.paymentStatus = status;
  }
  if (q) {
    filter.$or = [
      { orderId: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
      { planSlug: new RegExp(q, 'i') },
    ];
  }

  const [rows, total] = await Promise.all([
    CryptoPayment.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'email name')
      .lean(),
    CryptoPayment.countDocuments(filter),
  ]);

  res.json({
    payments: rows.map(serializeRow),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  });
});

exports.getCryptoPayment = asyncHandler(async (req, res) => {
  const orderId = String(req.params.orderId || '').trim();
  const row = await CryptoPayment.findOne({ orderId }).populate('userId', 'email name').lean();
  if (!row) {
    res.status(404).json({ error: 'Payment not found' });
    return;
  }
  res.json({
    payment: serializeRow(row),
    meta: row.meta || {},
  });
});

exports.reconcileCryptoPayment = asyncHandler(async (req, res) => {
  const orderId = String(req.params.orderId || '').trim();
  const row = await CryptoPayment.findOne({ orderId });
  if (!row) {
    res.status(404).json({ error: 'Payment not found' });
    return;
  }

  const newStatus = String(req.body.paymentStatus || 'finished').toLowerCase();
  const activate = req.body.activateSubscription !== false;

  row.paymentStatus = newStatus;
  row.meta = {
    ...(row.meta && typeof row.meta === 'object' ? row.meta : {}),
    manualReconcile: {
      at: new Date().toISOString(),
      by: req.userId?.toString() || 'admin',
      note: String(req.body.note || '').slice(0, 500),
    },
  };
  await row.save();

  let activated = false;
  if (activate && row.type === 'subscription' && row.userId && isPaidStatus(newStatus)) {
    await activateUserSubscription(row.userId, {
      planSlug: row.planSlug,
      billingInterval: row.billingInterval,
    });
    activated = true;
  }

  const updated = await CryptoPayment.findOne({ orderId }).populate('userId', 'email name').lean();
  res.json({
    ok: true,
    payment: serializeRow(updated),
    activated,
  });
});
