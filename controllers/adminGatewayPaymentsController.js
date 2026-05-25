const GatewayPayment = require('../models/GatewayPayment');
const { normalizeInterval } = require('../lib/billingIntervals');
const { fulfillGatewayPayment } = require('../services/gatewayPaymentFulfillment');
const { retrieveCheckoutSession } = require('../lib/stripeClient');
const { resolveGatewayConfig } = require('../services/gatewayConfig');
const { sessionMatchesRecord } = require('../services/stripeBilling');
const { asyncHandler } = require('../middleware/errorHandler');

function serializeRow(row) {
  const user = row.userId && typeof row.userId === 'object' ? row.userId : null;
  return {
    id: row._id.toString(),
    orderId: row.orderId,
    userId: user?._id?.toString() || (row.userId ? String(row.userId) : ''),
    userEmail: user?.email || '',
    userName: user?.name || '',
    provider: row.provider,
    type: row.type,
    planSlug: row.planSlug || '',
    billingInterval: normalizeInterval(row.billingInterval),
    priceAmount: row.priceAmount,
    priceCurrency: row.priceCurrency || 'usd',
    paymentStatus: row.paymentStatus,
    providerReference: row.providerReference || '',
    checkoutUrl: row.checkoutUrl || '',
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}

exports.listGatewayPayments = asyncHandler(async (req, res) => {
  const status = req.query.status ? String(req.query.status).toLowerCase() : '';
  const provider = req.query.provider ? String(req.query.provider).toLowerCase() : '';
  const q = String(req.query.q || '').trim();
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const skip = (page - 1) * limit;

  const filter = { type: 'subscription' };
  if (provider) filter.provider = provider;
  if (status === 'pending') {
    filter.paymentStatus = 'pending';
  } else if (status === 'successful') {
    filter.paymentStatus = 'successful';
  } else if (status === 'failed') {
    filter.paymentStatus = { $in: ['failed', 'expired'] };
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
    GatewayPayment.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'email name')
      .lean(),
    GatewayPayment.countDocuments(filter),
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

exports.reconcileGatewayPayment = asyncHandler(async (req, res) => {
  const orderId = String(req.params.orderId || '').trim();
  const record = await GatewayPayment.findOne({ orderId });
  if (!record) {
    res.status(404).json({ error: 'Payment not found' });
    return;
  }

  const activate = req.body.activateSubscription !== false;
  let result = { ok: true, status: record.paymentStatus, activated: false };

  if (record.provider === 'stripe' && record.paymentStatus !== 'successful') {
    const cfg = await resolveGatewayConfig('stripe');
    const sessionId =
      String(req.body.sessionId || '').trim() ||
      record.providerReference ||
      record.meta?.sessionId ||
      '';
    if (cfg?.secretKey && sessionId) {
      const session = await retrieveCheckoutSession(cfg.secretKey, sessionId);
      if (session.payment_status === 'paid' && sessionMatchesRecord(session, record)) {
        result = await fulfillGatewayPayment(record, {
          status: 'successful',
          providerReference: session.id,
          metaPatch: {
            manualReconcile: {
              at: new Date().toISOString(),
              by: req.userId?.toString() || 'admin',
              note: String(req.body.note || '').slice(0, 500),
            },
          },
        });
      }
    }
  }

  if (record.paymentStatus !== 'successful' && req.body.paymentStatus === 'successful') {
    result = await fulfillGatewayPayment(record, {
      status: 'successful',
      metaPatch: {
        manualReconcile: {
          at: new Date().toISOString(),
          by: req.userId?.toString() || 'admin',
          note: String(req.body.note || '').slice(0, 500),
        },
      },
    });
  } else if (req.body.paymentStatus && record.paymentStatus !== 'successful') {
    record.paymentStatus = String(req.body.paymentStatus).toLowerCase();
    await record.save();
    result = { ok: true, status: record.paymentStatus, activated: false };
  }

  if (activate && record.type === 'subscription' && result.activated === undefined) {
    const fresh = await GatewayPayment.findOne({ orderId });
    if (fresh?.paymentStatus === 'successful') {
      result.activated = true;
    }
  }

  res.json({
    payment: serializeRow(await GatewayPayment.findOne({ orderId }).populate('userId', 'email name').lean()),
    ...result,
  });
});
