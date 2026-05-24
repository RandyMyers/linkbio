const CryptoPayment = require('../models/CryptoPayment');

const PAID_STATUSES = ['finished', 'confirmed'];

function rangeStart(rangeDays) {
  const days = Math.min(90, Math.max(1, Number(rangeDays) || 30));
  return new Date(Date.now() - days * 86400000);
}

function normalizeUsername(username) {
  return String(username || '')
    .toLowerCase()
    .trim();
}

async function summaryForUsername(username, rangeDays = 30) {
  const uname = normalizeUsername(username);
  if (!uname) {
    return { rangeDays: 30, revenue: 0, orderCount: 0, topProducts: [] };
  }

  const range = Math.min(90, Math.max(1, Number(rangeDays) || 30));
  const since = rangeStart(range);

  const payments = await CryptoPayment.find({
    type: 'product',
    username: uname,
    paymentStatus: { $in: PAID_STATUSES },
    createdAt: { $gte: since },
  })
    .select('productId priceAmount createdAt')
    .lean();

  const revenue = payments.reduce((sum, row) => sum + (Number(row.priceAmount) || 0), 0);

  const byProduct = new Map();
  for (const row of payments) {
    const id = row.productId || 'unknown';
    const prev = byProduct.get(id) || { productId: id, count: 0, revenue: 0 };
    prev.count += 1;
    prev.revenue += Number(row.priceAmount) || 0;
    byProduct.set(id, prev);
  }

  const topProducts = [...byProduct.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
    .map((p) => ({
      productId: p.productId,
      count: p.count,
      revenue: Math.round(p.revenue * 100) / 100,
    }));

  return {
    rangeDays: range,
    revenue: Math.round(revenue * 100) / 100,
    orderCount: payments.length,
    topProducts,
  };
}

async function ordersForUsername(username, { limit = 50 } = {}) {
  const uname = normalizeUsername(username);
  if (!uname) return [];

  const cap = Math.min(100, Math.max(1, Number(limit) || 50));

  const rows = await CryptoPayment.find({
    type: 'product',
    username: uname,
  })
    .sort({ createdAt: -1 })
    .limit(cap)
    .lean();

  return rows.map((row) => ({
    orderId: row.orderId,
    productId: row.productId || '',
    priceAmount: row.priceAmount,
    priceCurrency: row.priceCurrency || 'usd',
    paymentStatus: row.paymentStatus || 'waiting',
    invoiceUrl: row.invoiceUrl || '',
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  }));
}

module.exports = { summaryForUsername, ordersForUsername, PAID_STATUSES };
