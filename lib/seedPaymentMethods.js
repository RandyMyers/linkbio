const config = require('../config');
const PaymentMethod = require('../models/PaymentMethod');
const PlatformSettings = require('../models/PlatformSettings');

const DEFAULT_METHODS = [
  {
    slug: 'bank_transfer',
    label: 'Bank transfer',
    description: 'Wire or SEPA transfer in your selected fiat currency. We verify manually.',
    enabled: true,
    sortOrder: 0,
    isSystem: true,
    config: {
      instructionsMarkdown: config.paymentInstructionsBank || '',
      beneficiaryName: '',
      iban: '',
      swift: '',
      referenceHint: 'Include your email in the transfer reference',
    },
  },
  {
    slug: 'crypto',
    label: 'Cryptocurrency',
    description: 'Checkout via NOWPayments (BTC, ETH, USDT, and more).',
    enabled: true,
    sortOrder: 1,
    isSystem: true,
    config: {
      provider: 'nowpayments',
      instructionsMarkdown: config.paymentInstructionsCrypto || '',
    },
  },
  {
    slug: 'flutterwave',
    label: 'Card (Flutterwave)',
    description: 'Pay with credit or debit card via Flutterwave.',
    enabled: true,
    sortOrder: 2,
    isSystem: true,
    config: { provider: 'flutterwave' },
  },
  {
    slug: 'squad',
    label: 'Card (Squad)',
    description: 'Pay with credit or debit card via Squad (USD).',
    enabled: false,
    sortOrder: 3,
    isSystem: true,
    config: { provider: 'squad' },
  },
  {
    slug: 'stripe',
    label: 'Stripe',
    description: 'Secure checkout via Stripe — cards, wallets, and local methods where available.',
    enabled: true,
    sortOrder: 4,
    isSystem: true,
    config: { provider: 'stripe' },
  },
];

async function seedPaymentMethods() {
  for (const def of DEFAULT_METHODS) {
    const existing = await PaymentMethod.findOne({ slug: def.slug }).lean();
    if (!existing) {
      await PaymentMethod.create(def);
      continue;
    }
    const updates = {};
    if (!existing.label) updates.label = def.label;
    if (!existing.description) updates.description = def.description;
    if (existing.isSystem !== true) updates.isSystem = true;
    if (existing.sortOrder == null && def.sortOrder != null) updates.sortOrder = def.sortOrder;
    const cfg = existing.config && typeof existing.config === 'object' ? existing.config : {};
    if (!cfg.provider && def.config?.provider) {
      updates.config = { ...cfg, provider: def.config.provider };
    }
    if (!cfg.instructionsMarkdown && def.config?.instructionsMarkdown) {
      updates.config = { ...(updates.config || cfg), instructionsMarkdown: def.config.instructionsMarkdown };
    }
    if (Object.keys(updates).length) {
      await PaymentMethod.updateOne({ slug: def.slug }, { $set: updates });
    }
  }

  await PlatformSettings.findOneAndUpdate(
    { _id: 'global' },
    {
      $setOnInsert: {
        billingEnabled: true,
        defaultCurrency: 'usd',
        supportedCurrencies: ['usd', 'eur', 'gbp'],
        supportedIntervals: ['monthly', 'quarterly', 'yearly'],
        maintenanceMessage: '',
      },
    },
    { upsert: true },
  );
}

module.exports = { seedPaymentMethods };
