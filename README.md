# LinkBio API Server

Express + MongoDB backend. The CRA client requires `REACT_APP_API_URL` (see `linkbio/client/.env.example`) for auth, builder, analytics, and billing.

## Payments

| Method | Flow |
|--------|------|
| **Bank transfer** | User submits `POST /api/billing/payment-requests` → admin approves in dashboard/API |
| **Crypto (NOWPayments)** | User gets invoice URL from `POST /api/billing/crypto/checkout` → IPN webhook activates plan |

Stripe is **not** used. Configure NOWPayments from `linkbio/nowpayments.txt` and your dashboard.

## Setup

```bash
cd linkbio/server
cp .env.example .env
# Add: MONGODB_URI, JWT_SECRET, CLOUDINARY_*, NOWPAYMENTS_*, PAYMENT_INSTRUCTIONS_BANK
npm install
npm run dev
```

## Environment (billing)

| Variable | Purpose |
|----------|---------|
| `NOWPAYMENTS_API_KEY` | API key from NOWPayments dashboard |
| `NOWPAYMENTS_IPN_SECRET` | IPN secret for webhook HMAC verification |
| `NOWPAYMENTS_IPN_CALLBACK_URL` | Optional; default `{API_PUBLIC_URL}/api/webhooks/nowpayments` |
| `API_PUBLIC_URL` | Public base URL of this server (for IPN) |
| `PAYMENT_INSTRUCTIONS_BANK` | Bank wire instructions shown in billing UI |
| `PAYMENT_INSTRUCTIONS_CRYPTO` | Optional extra crypto payment notes |

## Billing API

### Authenticated

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/billing` | Plan, limits, bank instructions, pending requests |
| POST | `/api/billing/payment-requests` | `{ planSlug, interval, payerReference }` bank transfer |
| GET | `/api/billing/payment-requests` | User's requests |
| POST | `/api/billing/crypto/checkout` | `{ planSlug, interval }` → `{ invoiceUrl, orderId }` |
| GET | `/api/billing/crypto/:orderId` | Poll crypto payment status |

### Webhooks

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/webhooks/nowpayments` | NOWPayments IPN (HMAC sha512) |

### Admin

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/admin/payment-requests` | List bank transfer requests |
| POST | `/api/admin/payment-requests/:id/decide` | `{ decision: approve\|reject, adminNote?, paidThrough? }` |

### Public commerce

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/public/:username/checkout` | Product card crypto invoice `{ productId }` |

## NOWPayments local testing

1. Set `NOWPAYMENTS_API_KEY` and `NOWPAYMENTS_IPN_SECRET` in `.env`.
2. Expose API (e.g. ngrok) and set `NOWPAYMENTS_IPN_CALLBACK_URL` or `API_PUBLIC_URL`.
3. In NOWPayments dashboard → Payment Settings, add the same IPN URL.
4. Create checkout → pay in sandbox → verify user `subscriptionPlan` updates on `finished` IPN.

## Cloudinary

Uploads use `CLOUDINARY_*` from `.env` (already configured in your environment).

## Docs

`../docs/SERVER_IMPLEMENTATION_PLAN.md` · `../nowpayments.txt`
