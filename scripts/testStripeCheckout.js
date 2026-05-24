#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connectDb } = require('../lib/db');
const { resolveGatewayConfig } = require('../services/gatewayConfig');
const { createCheckoutSession } = require('../lib/stripeClient');

async function main() {
  await connectDb();
  const cfg = await resolveGatewayConfig('stripe');
  console.log('stripe configured:', cfg?.configured, 'env:', cfg?.environment);
  console.log('secret prefix:', String(cfg?.secretKey || cfg?.apiKey || '').slice(0, 12));

  if (!cfg?.secretKey && !cfg?.apiKey) {
    console.error('No stripe secret key');
    process.exit(1);
  }

  const secretKey = cfg.secretKey || cfg.apiKey;
  try {
    const session = await createCheckoutSession(secretKey, {
      orderId: 'lb_st_test_order_123',
      amountMinor: 2900,
      currency: 'usd',
      customerEmail: 'test@example.com',
      planLabel: 'Pro',
      successUrl: 'http://localhost:3000/checkout?paid=1&session_id={CHECKOUT_SESSION_ID}',
      cancelUrl: 'http://localhost:3000/checkout?checkout=canceled',
      metadata: { planSlug: 'pro', billingInterval: 'quarterly' },
    });
    console.log('OK session:', session.id, session.url?.slice(0, 60));
  } catch (e) {
    console.error('Stripe error:', e.message);
    if (e.raw) console.error('raw:', JSON.stringify(e.raw, null, 2));
    if (e.type) console.error('type:', e.type, 'code:', e.code);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
