const VALID = ['usd', 'eur', 'gbp'];

const SYMBOLS = {
  usd: '$',
  eur: '€',
  gbp: '£',
};

const LABELS = {
  usd: 'USD',
  eur: 'EUR',
  gbp: 'GBP',
};

function normalizeCurrency(raw) {
  const v = String(raw || 'usd')
    .toLowerCase()
    .trim();
  return VALID.includes(v) ? v : 'usd';
}

function formatMoney(amount, currency) {
  const c = normalizeCurrency(currency);
  const sym = SYMBOLS[c] || '';
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  const rounded = Math.round(n * 100) / 100;
  return `${sym}${rounded.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

module.exports = {
  VALID_CURRENCIES: VALID,
  CURRENCY_SYMBOLS: SYMBOLS,
  CURRENCY_LABELS: LABELS,
  normalizeCurrency,
  formatMoney,
};
