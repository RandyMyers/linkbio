const express = require('express');
const billingController = require('../controllers/billingController');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.get('/billing/quote', billingController.getQuote);
router.get('/billing/subscription', requireAuth, billingController.getSubscription);
router.get('/billing/subscription/history', requireAuth, billingController.getSubscriptionHistory);
router.post('/billing/subscription/activate-zero', requireAuth, billingController.activateZeroAmountCheckout);
router.post('/billing/subscription/quote', requireAuth, billingController.postSubscriptionQuote);
router.post('/billing/subscription/schedule-downgrade', requireAuth, billingController.scheduleSubscriptionDowngrade);
router.delete('/billing/subscription/schedule-downgrade', requireAuth, billingController.cancelScheduledDowngrade);
router.get('/billing', requireAuth, billingController.getBilling);
router.post('/billing/payment-requests', requireAuth, billingController.createPaymentRequest);
router.get('/billing/payment-requests', requireAuth, billingController.listPaymentRequests);
router.post('/billing/crypto/checkout', requireAuth, billingController.createCryptoCheckout);
router.get('/billing/crypto/:orderId', requireAuth, billingController.getCryptoPaymentStatus);
router.post('/billing/flutterwave/checkout', requireAuth, billingController.createFlutterwaveCheckout);
router.post('/billing/flutterwave/confirm', requireAuth, billingController.confirmFlutterwaveCheckout);
router.post('/billing/squad/checkout', requireAuth, billingController.createSquadCheckout);
router.post('/billing/squad/confirm', requireAuth, billingController.confirmSquadCheckout);
router.post('/billing/stripe/checkout', requireAuth, billingController.createStripeCheckout);
router.post('/billing/stripe/confirm', requireAuth, billingController.confirmStripeCheckout);
router.get('/billing/gateway/:orderId', requireAuth, billingController.getGatewayPaymentStatus);
router.post('/billing/cancel', requireAuth, billingController.updateSubscriptionCancel);

module.exports = router;
