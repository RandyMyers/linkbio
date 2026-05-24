const SubscriptionEvent = require('../models/SubscriptionEvent');
const PaymentRequest = require('../models/PaymentRequest');
const CryptoPayment = require('../models/CryptoPayment');
const GatewayPayment = require('../models/GatewayPayment');

const EVENT_LABELS = {
  activated: 'Subscription started',
  renewed: 'Subscription renewed',
  upgraded: 'Plan upgraded',
  downgrade_scheduled: 'Downgrade scheduled',
  downgrade_applied: 'Downgrade applied',
  canceled: 'Subscription canceled',
  expired: 'Subscription expired',
  resumed: 'Subscription resumed',
  admin_adjusted: 'Admin adjustment',
};

function iso(d) {
  return d ? new Date(d).toISOString() : null;
}

async function subscriptionHistoryForUser(userId, { limit = 50 } = {}) {
  const cap = Math.min(100, Math.max(1, Number(limit) || 50));
  const uid = userId;

  const [events, bank, crypto, gateway] = await Promise.all([
    SubscriptionEvent.find({ userId: uid }).sort({ createdAt: -1 }).limit(cap).lean(),
    PaymentRequest.find({ userId: uid }).sort({ createdAt: -1 }).limit(cap).lean(),
    CryptoPayment.find({ userId: uid, type: 'subscription' }).sort({ createdAt: -1 }).limit(cap).lean(),
    GatewayPayment.find({ userId: uid, type: 'subscription' }).sort({ createdAt: -1 }).limit(cap).lean(),
  ]);

  const rows = [];

  for (const e of events) {
    rows.push({
      id: `event-${e._id}`,
      kind: 'subscription_event',
      date: iso(e.createdAt),
      title: EVENT_LABELS[e.type] || e.type,
      detail: [e.fromPlan, e.toPlan].filter(Boolean).join(' → ') || e.billingInterval || '',
      status: e.type,
      amount: e.amountCharged > 0 ? e.amountCharged : null,
      currency: e.currency || '',
      creditAmount: e.creditApplied || 0,
      meta: { type: e.type, paymentRef: e.paymentRef },
    });
  }

  for (const p of bank) {
    rows.push({
      id: `bank-${p._id}`,
      kind: 'bank_transfer',
      date: iso(p.decidedAt || p.createdAt),
      title: 'Bank transfer',
      detail: `${p.requestedPlan} (${p.billingInterval || 'monthly'})`,
      status: p.status,
      amount: p.amountDue ?? p.listAmount ?? null,
      currency: p.currency || 'usd',
      creditAmount: p.creditAmount ?? 0,
      chargeType: p.chargeType || 'new',
      link: null,
    });
  }

  for (const c of crypto) {
    rows.push({
      id: `crypto-${c.orderId}`,
      kind: 'crypto',
      date: iso(c.createdAt),
      title: 'Crypto payment',
      detail: c.planSlug || c.orderId,
      status: c.paymentStatus,
      amount: c.priceAmount,
      currency: c.priceCurrency || 'usd',
      creditAmount: c.creditAmount ?? 0,
      chargeType: c.chargeType || 'new',
      link: c.invoiceUrl || null,
    });
  }

  for (const g of gateway) {
    rows.push({
      id: `gateway-${g.orderId}`,
      kind: 'gateway',
      date: iso(g.updatedAt || g.createdAt),
      title: `${g.provider} payment`,
      detail: `${g.planSlug} (${g.billingInterval || 'monthly'})`,
      status: g.paymentStatus,
      amount: g.priceAmount,
      currency: g.priceCurrency || 'usd',
      creditAmount: g.creditAmount ?? 0,
      chargeType: g.chargeType || 'new',
      link: g.checkoutUrl || null,
    });
  }

  rows.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  return { history: rows.slice(0, cap) };
}

module.exports = { subscriptionHistoryForUser, EVENT_LABELS };
