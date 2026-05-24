const { normalizeCurrency, formatMoney } = require('./currencies');
const { roundMoney } = require('./subscriptionProration');

function accountCreditForUser(user, currency) {
  const c = normalizeCurrency(currency);
  const raw = user.accountCredit?.[c];
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return roundMoney(n);
}

function applyAccountCreditToQuote(quote, user) {
  if (!quote?.allowed || quote.amountDue <= 0) {
    return { ...quote, accountCreditApplied: 0, accountCreditDisplay: formatMoney(0, quote.currency) };
  }
  const available = accountCreditForUser(user, quote.currency);
  if (available <= 0) {
    return {
      ...quote,
      accountCreditApplied: 0,
      accountCreditDisplay: formatMoney(0, quote.currency),
    };
  }
  const applied = roundMoney(Math.min(available, quote.amountDue));
  const amountDue = roundMoney(Math.max(0, quote.amountDue - applied));
  return {
    ...quote,
    accountCreditApplied: applied,
    accountCreditDisplay: `−${formatMoney(applied, quote.currency)}`,
    amountDue,
    amountDisplay: formatMoney(amountDue, quote.currency),
  };
}

module.exports = { accountCreditForUser, applyAccountCreditToQuote };
