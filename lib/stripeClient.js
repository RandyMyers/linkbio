const Stripe = require('stripe');

/** Checkout Session types — Stripe filters by account + country; invalid types return a clear API error. */
const CHECKOUT_PAYMENT_METHOD_TYPES = [
  'card',
  'link',
  'cashapp',
  'klarna',
  'affirm',
  'afterpay_clearpay',
  'amazon_pay',
];

function createStripeClient(secretKey) {
  return new Stripe(String(secretKey));
}

function stripeErrorMessage(err) {
  const msg = err?.raw?.message || err?.message || 'Stripe checkout failed';
  if (/business name/i.test(msg)) {
    return `${msg} Open Stripe Dashboard → Settings → Business details and save a public business name, then try again.`;
  }
  if (/parameter_unknown/i.test(err?.code) && /automatic_payment_methods/i.test(msg)) {
    return 'Stripe checkout configuration error. Please contact support.';
  }
  return msg;
}

/**
 * Create a Stripe Checkout Session and return its hosted payment URL (`session.url`).
 * @see https://docs.stripe.com/api/checkout/sessions/create
 */
async function createCheckoutSession(secretKey, params) {
  const stripe = createStripeClient(secretKey);
  const {
    orderId,
    amountMinor,
    currency,
    customerEmail,
    planLabel,
    successUrl,
    cancelUrl,
    metadata,
  } = params;

  const base = {
    mode: 'payment',
    customer_email: customerEmail,
    client_reference_id: orderId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: String(currency).toLowerCase(),
          unit_amount: amountMinor,
          product_data: {
            name: planLabel || 'LinkBio subscription',
            description: 'Subscription upgrade',
          },
        },
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      orderId,
      ...metadata,
    },
    payment_intent_data: {
      metadata: {
        orderId,
        ...(metadata || {}),
      },
    },
  };

  try {
    return await stripe.checkout.sessions.create({
      ...base,
      payment_method_types: CHECKOUT_PAYMENT_METHOD_TYPES,
    });
  } catch (err) {
    const code = err?.raw?.code || err?.code;
    const param = err?.raw?.param || err?.param;
    if (
      code === 'payment_method_type_invalid' ||
      (code === 'parameter_invalid_empty' && param === 'payment_method_types')
    ) {
      return stripe.checkout.sessions.create({
        ...base,
        payment_method_types: ['card'],
      });
    }
    const wrapped = new Error(stripeErrorMessage(err));
    wrapped.statusCode = err.statusCode === 400 ? 400 : 502;
    throw wrapped;
  }
}

async function retrieveCheckoutSession(secretKey, sessionId) {
  const stripe = createStripeClient(secretKey);
  return stripe.checkout.sessions.retrieve(String(sessionId));
}

function constructWebhookEvent(rawBody, signature, webhookSecret) {
  return Stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}

module.exports = {
  createCheckoutSession,
  retrieveCheckoutSession,
  constructWebhookEvent,
};
