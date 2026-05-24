const config = require('../config');
const PaymentMethod = require('../models/PaymentMethod');
const {
  isNowPaymentsConfigured,
  isFlutterwaveConfigured,
  isSquadConfigured,
  isStripeConfigured,
} = require('./gatewayConfig');

function formatBankInstructions(method) {
  const c = method?.config || {};
  const parts = [];
  if (c.instructionsMarkdown) parts.push(String(c.instructionsMarkdown).trim());
  if (c.beneficiaryName) parts.push(`Beneficiary: ${c.beneficiaryName}`);
  if (c.iban) parts.push(`IBAN: ${c.iban}`);
  if (c.swift) parts.push(`SWIFT: ${c.swift}`);
  if (c.referenceHint) parts.push(`Reference: ${c.referenceHint}`);
  const joined = parts.filter(Boolean).join('\n');
  if (joined) return joined;
  return config.paymentInstructionsBank || null;
}

function formatCryptoInstructions(method) {
  const c = method?.config || {};
  if (c.instructionsMarkdown) return String(c.instructionsMarkdown).trim();
  return config.paymentInstructionsCrypto || null;
}

function methodApplies(method, { planSlug, currency } = {}) {
  const plans = Array.isArray(method.plans) ? method.plans.filter(Boolean) : [];
  const currencies = Array.isArray(method.currencies) ? method.currencies.filter(Boolean) : [];
  if (plans.length && planSlug && !plans.includes(planSlug)) return false;
  if (currencies.length && currency && !currencies.includes(String(currency).toLowerCase())) {
    return false;
  }
  return true;
}

function serializeCheckoutMethod(method) {
  const c = method.config && typeof method.config === 'object' ? method.config : {};
  const base = {
    enabled: !!method.enabled,
    label: method.label || method.slug,
    description: method.description || '',
    sortOrder: method.sortOrder ?? 0,
    currencies: method.currencies || [],
    plans: method.plans || [],
  };
  if (method.slug === 'payment_link') {
    return {
      ...base,
      checkoutUrl: c.checkoutUrl || '',
      openInNewTab: c.openInNewTab !== false,
    };
  }
  if (method.slug === 'crypto') {
    return {
      ...base,
      provider: c.provider || 'nowpayments',
      note: 'Pay via NOWPayments in BTC, ETH, USDT, and more.',
      fiat: false,
    };
  }
  if (method.slug === 'bank_transfer') {
    return { ...base, fiat: true };
  }
  if (method.slug === 'flutterwave') {
    return {
      ...base,
      fiat: true,
      cardOnly: true,
      note: 'Pay with credit or debit card via Flutterwave.',
    };
  }
  if (method.slug === 'squad') {
    return {
      ...base,
      fiat: true,
      cardOnly: true,
      note: 'Pay with credit or debit card via Squad (USD).',
    };
  }
  if (method.slug === 'stripe') {
    return {
      ...base,
      fiat: true,
      note: 'Secure checkout via Stripe — cards, wallets, and local methods where available.',
    };
  }
  return base;
}

async function loadEnabledPaymentMethods() {
  const rows = await PaymentMethod.find({ enabled: true }).sort({ sortOrder: 1, slug: 1 }).lean();
  return rows;
}

async function buildCreatorBillingPaymentConfig() {
  const rows = await loadEnabledPaymentMethods();
  const disabledSlugs = await PaymentMethod.find({ enabled: false }).distinct('slug');
  const disabledSet = new Set(disabledSlugs);
  const cryptoConfigured = await isNowPaymentsConfigured();
  const flutterwaveConfigured = await isFlutterwaveConfigured();
  const squadConfigured = await isSquadConfigured();
  const stripeConfigured = await isStripeConfigured();

  const paymentMethods = {};
  let bankTransferText = config.paymentInstructionsBank || null;
  let cryptoText = config.paymentInstructionsCrypto || null;

  for (const row of rows) {
    if (row.slug === 'crypto' && !cryptoConfigured) continue;
    if (row.slug === 'flutterwave' && !flutterwaveConfigured) continue;
    if (row.slug === 'squad' && !squadConfigured) continue;
    if (row.slug === 'stripe' && !stripeConfigured) continue;

    paymentMethods[row.slug] = serializeCheckoutMethod(row);

    if (row.slug === 'bank_transfer') {
      bankTransferText = formatBankInstructions(row);
    }
    if (row.slug === 'crypto') {
      cryptoText = formatCryptoInstructions(row);
    }
  }

  if (flutterwaveConfigured && !paymentMethods.flutterwave && !disabledSet.has('flutterwave')) {
    paymentMethods.flutterwave = {
      enabled: true,
      label: 'Card (Flutterwave)',
      fiat: true,
      cardOnly: true,
      description: 'Credit or debit card',
      sortOrder: 2,
    };
  }
  if (squadConfigured && !paymentMethods.squad && !disabledSet.has('squad')) {
    paymentMethods.squad = {
      enabled: true,
      label: 'Card (Squad)',
      fiat: true,
      cardOnly: true,
      description: 'Credit or debit card (USD)',
      sortOrder: 3,
    };
  }
  if (stripeConfigured && !paymentMethods.stripe && !disabledSet.has('stripe')) {
    paymentMethods.stripe = {
      enabled: true,
      label: 'Stripe',
      fiat: true,
      description: 'Cards, Apple Pay, Google Pay, Klarna, and more (by country)',
      sortOrder: 4,
    };
  }

  if (!Object.keys(paymentMethods).length) {
    paymentMethods.bank_transfer = {
      enabled: true,
      label: 'Bank transfer',
      fiat: true,
      description: 'Wire or SEPA transfer. We verify manually.',
      sortOrder: 0,
    };
    paymentMethods.crypto = {
      enabled: cryptoConfigured,
      label: 'Cryptocurrency',
      fiat: false,
      note: 'Pay via NOWPayments in BTC, ETH, USDT, and more.',
      sortOrder: 1,
    };
  }

  return {
    paymentMethods,
    paymentInstructions: {
      bankTransfer: bankTransferText,
      crypto: cryptoText,
    },
    cryptoConfigured,
    flutterwaveConfigured,
    squadConfigured,
    stripeConfigured,
  };
}

module.exports = {
  loadEnabledPaymentMethods,
  buildCreatorBillingPaymentConfig,
  formatBankInstructions,
  methodApplies,
  serializeCheckoutMethod,
};
