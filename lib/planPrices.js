const { normalizeCurrency } = require('./currencies');
const { VALID_BILLING_INTERVALS } = require('./billingIntervals');

const CURRENCIES = ['usd', 'eur', 'gbp'];

const emptyIntervalRow = () => ({ usd: null, eur: null, gbp: null });

function emptyPricesMatrix() {
  return {
    monthly: emptyIntervalRow(),
    quarterly: emptyIntervalRow(),
    yearly: emptyIntervalRow(),
  };
}

function hasAnyPriceValue(prices) {
  if (!prices || typeof prices !== 'object') return false;
  for (const interval of VALID_BILLING_INTERVALS) {
    const row = prices[interval];
    if (!row || typeof row !== 'object') continue;
    for (const c of CURRENCIES) {
      const n = Number(row[c]);
      if (Number.isFinite(n) && n > 0) return true;
    }
  }
  return false;
}

function normalizePriceCell(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Normalize admin/API prices body into { monthly, quarterly, yearly } × { usd, eur, gbp }.
 */
function normalizePricesMatrix(raw) {
  const base = emptyPricesMatrix();
  if (!raw || typeof raw !== 'object') return base;

  for (const interval of VALID_BILLING_INTERVALS) {
    const row = raw[interval];
    if (!row || typeof row !== 'object') continue;
    for (const c of CURRENCIES) {
      base[interval][c] = normalizePriceCell(row[c]);
    }
  }
  return base;
}

/** Flat map for planPricing cache: { monthly: { usd: 10, ... }, ... } */
function pricesMatrixToTier(prices) {
  const matrix = normalizePricesMatrix(prices);
  const tier = {};
  for (const interval of VALID_BILLING_INTERVALS) {
    const row = matrix[interval];
    const has = CURRENCIES.some((c) => row[c] != null && row[c] > 0);
    if (has) {
      tier[interval] = {};
      for (const c of CURRENCIES) {
        if (row[c] != null && row[c] > 0) tier[interval][c] = row[c];
      }
    }
  }
  return Object.keys(tier).length ? tier : null;
}

function amountFromTier(tier, interval, currency) {
  if (!tier) return null;
  const iv = String(interval || 'monthly').toLowerCase();
  const row = tier[iv] || tier.monthly;
  if (!row) return null;
  const c = normalizeCurrency(currency);
  return row[c] ?? row.usd ?? null;
}

module.exports = {
  CURRENCIES,
  emptyPricesMatrix,
  hasAnyPriceValue,
  normalizePricesMatrix,
  pricesMatrixToTier,
  amountFromTier,
};
