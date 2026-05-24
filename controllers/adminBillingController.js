const mongoose = require('mongoose');
const User = require('../models/User');
const Plan = require('../models/Plan');
const PaymentRequest = require('../models/PaymentRequest');
const { normalizeInterval } = require('../lib/billingIntervals');
const { applySubscriptionActivation } = require('../lib/subscriptionLifecycle');
const { applyCheckoutBalances } = require('../lib/subscriptionCheckout');
const { addMonths, intervalToMonths } = require('../lib/subscriptionActivation');
const { asyncHandler } = require('../middleware/errorHandler');

exports.listPaymentRequests = asyncHandler(async (req, res) => {
  const status = req.query.status ? String(req.query.status) : undefined;
  const q = status ? { status } : {};
  const rows = await PaymentRequest.find(q)
    .sort({ createdAt: -1 })
    .limit(200)
    .populate('userId', 'email name')
    .lean();

  res.json({
    requests: rows.map((p) => ({
      id: p._id.toString(),
      userId: p.userId?._id?.toString() || p.userId?.toString(),
      email: p.userId?.email || '',
      requestedPlan: p.requestedPlan,
      billingInterval: normalizeInterval(p.billingInterval),
      currency: p.currency || 'usd',
      listAmount: p.listAmount,
      creditAmount: p.creditAmount ?? 0,
      amountDue: p.amountDue ?? p.listAmount,
      chargeType: p.chargeType || 'new',
      method: p.method,
      status: p.status,
      payerReference: p.payerReference || '',
      adminNote: p.adminNote || '',
      createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : null,
      decidedAt: p.decidedAt ? new Date(p.decidedAt).toISOString() : null,
    })),
  });
});

exports.decidePaymentRequest = asyncHandler(async (req, res) => {
  let requestId;
  try {
    requestId = new mongoose.Types.ObjectId(req.params.id);
  } catch {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const decision = String(req.body.decision || '').toLowerCase();
  if (decision !== 'approve' && decision !== 'reject') {
    res.status(400).json({ error: 'decision must be approve or reject' });
    return;
  }

  const adminNote = String(req.body.adminNote || '').trim().slice(0, 2000);
  let paidThroughDate = null;
  if (req.body.paidThrough) {
    paidThroughDate = new Date(String(req.body.paidThrough));
    if (Number.isNaN(paidThroughDate.getTime())) {
      res.status(400).json({ error: 'Invalid paidThrough date' });
      return;
    }
  }

  const doc = await PaymentRequest.findById(requestId);
  if (!doc || doc.status !== 'pending') {
    res.status(404).json({ error: 'Pending payment request not found' });
    return;
  }

  if (decision === 'reject') {
    doc.status = 'rejected';
    doc.decidedAt = new Date();
    doc.adminNote = adminNote;
    await doc.save();
    res.json({ ok: true, request: { id: doc._id.toString(), status: doc.status } });
    return;
  }

  const planDoc = await Plan.findOne({
    slug: doc.requestedPlan,
    isActive: true,
    requiresPaymentSubscription: true,
  }).lean();
  if (!planDoc) {
    res.status(400).json({ error: 'Requested plan is not a payable active tier' });
    return;
  }

  if (doc.amountDue != null && doc.listAmount != null) {
    const expected = Number(doc.amountDue);
    const note = String(req.body.amountConfirmed || '').trim();
    if (req.body.strictAmount === true && !note) {
      res.status(400).json({
        error: `Confirm expected amount ${expected} ${(doc.currency || 'usd').toUpperCase()} with amountConfirmed.`,
        expectedAmount: expected,
        currency: doc.currency || 'usd',
      });
      return;
    }
  }

  const months = intervalToMonths(doc.billingInterval);
  const through = paidThroughDate || addMonths(new Date(), months);

  await applySubscriptionActivation(doc.userId, {
    planSlug: doc.requestedPlan,
    billingInterval: doc.billingInterval,
    paidThrough: through,
    chargeType: doc.chargeType || 'new',
    amountCharged: doc.amountDue ?? doc.listAmount,
    creditApplied: doc.creditAmount ?? 0,
    paymentRef: { kind: 'bank', id: doc._id.toString() },
  });

  await applyCheckoutBalances(doc.userId, {
    promoCode: doc.promoCode || '',
    accountCreditApplied: doc.accountCreditApplied ?? 0,
    currency: doc.currency || 'usd',
  });

  doc.status = 'approved';
  doc.decidedAt = new Date();
  doc.adminNote = adminNote;
  await doc.save();

  res.json({
    ok: true,
    request: { id: doc._id.toString(), status: doc.status },
    subscriptionPaidThrough: through.toISOString(),
  });
});
