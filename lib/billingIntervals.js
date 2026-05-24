const VALID = ['monthly', 'quarterly', 'yearly'];

const LABELS = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};

function intervalToMonths(interval) {
  const i = String(interval || 'monthly').toLowerCase();
  if (i === 'yearly') return 12;
  if (i === 'quarterly') return 3;
  return 1;
}

function normalizeInterval(raw) {
  const v = String(raw || 'monthly')
    .toLowerCase()
    .trim();
  return VALID.includes(v) ? v : 'monthly';
}

function normalizeAllowedBillingIntervals(raw, { requiresPayment = false } = {}) {
  if (!requiresPayment) return [];
  if (!Array.isArray(raw) || raw.length === 0) return [...VALID];
  return raw.map((x) => String(x).toLowerCase().trim()).filter((x) => VALID.includes(x));
}

module.exports = {
  VALID_BILLING_INTERVALS: VALID,
  INTERVAL_LABELS: LABELS,
  intervalToMonths,
  normalizeInterval,
  normalizeAllowedBillingIntervals,
};
