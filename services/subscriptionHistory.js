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

const PROVIDER_LABELS = {
  stripe: 'Stripe',
  flutterwave: 'Flutterwave',
  squad: 'Squad',
};

function iso(d) {
  return d ? new Date(d).toISOString() : null;
}

function capLimit(limit) {
  return Math.min(100, Math.max(1, Number(limit) || 50));
}

function planChangeDetail(fromPlan, toPlan, billingInterval) {
  const from = fromPlan ? String(fromPlan) : '';
  const to = toPlan ? String(toPlan) : '';
  if (from && to && from !== to) return `${from} → ${to}`;
  if (to) return to;
  if (billingInterval) return billingInterval;
  return '—';
}

/** Subscription lifecycle only — plan, renewal, cancellations (no payment transactions). */
async function subscriptionEventsForUser(userId, { limit = 50 } = {}) {
  const cap = capLimit(limit);
  const events = await SubscriptionEvent.find({ userId })
    .sort({ createdAt: -1 })
    .limit(cap)
    .lean();

  const history = events.map((e) => ({
    id: `event-${e._id}`,
    kind: 'subscription_event',
    date: iso(e.createdAt),
    eventType: e.type,
    title: EVENT_LABELS[e.type] || e.type,
    plan: e.toPlan || e.fromPlan || '',
    fromPlan: e.fromPlan || '',
    toPlan: e.toPlan || '',
    billingInterval: e.billingInterval || '',
    detail: planChangeDetail(e.fromPlan, e.toPlan, e.billingInterval),
    validThrough: iso(e.paidThroughAfter),
    paymentRef: e.paymentRef?.id
      ? { kind: e.paymentRef.kind || '', id: e.paymentRef.id }
      : null,
  }));

  return { history, filter: 'subscriptions' };
}

/** Payment transactions only — bank, crypto, card checkouts. */
async function paymentHistoryForUser(userId, { limit = 50 } = {}) {
  const cap = capLimit(limit);
  const uid = userId;

  const [bank, crypto, gateway] = await Promise.all([
    PaymentRequest.find({ userId: uid }).sort({ createdAt: -1 }).limit(cap).lean(),
    CryptoPayment.find({ userId: uid, type: 'subscription' }).sort({ createdAt: -1 }).limit(cap).lean(),
    GatewayPayment.find({ userId: uid, type: 'subscription' }).sort({ createdAt: -1 }).limit(cap).lean(),
  ]);

  const rows = [];

  for (const p of bank) {
    rows.push({
      id: `bank-${p._id}`,
      kind: 'bank_transfer',
      date: iso(p.decidedAt || p.createdAt),
      method: 'Bank transfer',
      title: 'Bank transfer',
      plan: p.requestedPlan || '',
      billingInterval: p.billingInterval || 'monthly',
      detail: `${p.requestedPlan || '—'} (${p.billingInterval || 'monthly'})`,
      status: p.status,
      amount: p.amountDue ?? p.listAmount ?? null,
      currency: p.currency || 'usd',
      reference: p.payerReference || p._id.toString(),
      link: null,
    });
  }

  for (const c of crypto) {
    rows.push({
      id: `crypto-${c.orderId}`,
      kind: 'crypto',
      date: iso(c.createdAt),
      method: 'Crypto',
      title: 'Crypto',
      plan: c.planSlug || '',
      billingInterval: c.billingInterval || '',
      detail: c.planSlug || c.orderId,
      status: c.paymentStatus,
      amount: c.priceAmount,
      currency: c.priceCurrency || 'usd',
      reference: c.orderId,
      link: c.invoiceUrl || null,
    });
  }

  for (const g of gateway) {
    const providerLabel = PROVIDER_LABELS[g.provider] || g.provider || 'Card';
    rows.push({
      id: `gateway-${g.orderId}`,
      kind: 'gateway',
      date: iso(g.updatedAt || g.createdAt),
      method: providerLabel,
      title: providerLabel,
      plan: g.planSlug || '',
      billingInterval: g.billingInterval || 'monthly',
      detail: `${g.planSlug || '—'} (${g.billingInterval || 'monthly'})`,
      status: g.paymentStatus,
      amount: g.priceAmount,
      currency: g.priceCurrency || 'usd',
      reference: g.providerReference || g.orderId,
      link: g.checkoutUrl || null,
    });
  }

  rows.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  return { history: rows.slice(0, cap), filter: 'payments' };
}

async function subscriptionHistoryForUser(userId, { limit = 50, filter = 'all' } = {}) {
  if (filter === 'subscriptions') {
    return subscriptionEventsForUser(userId, { limit });
  }
  if (filter === 'payments') {
    return paymentHistoryForUser(userId, { limit });
  }
  const [subs, payments] = await Promise.all([
    subscriptionEventsForUser(userId, { limit }),
    paymentHistoryForUser(userId, { limit }),
  ]);
  const merged = [...subs.history, ...payments.history].sort(
    (a, b) => new Date(b.date || 0) - new Date(a.date || 0),
  );
  return { history: merged.slice(0, capLimit(limit)), filter: 'all' };
}

module.exports = {
  subscriptionHistoryForUser,
  subscriptionEventsForUser,
  paymentHistoryForUser,
  EVENT_LABELS,
};
