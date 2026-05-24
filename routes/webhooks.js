const express = require('express');
const nowpaymentsWebhookController = require('../controllers/nowpaymentsWebhookController');
const flutterwaveWebhookController = require('../controllers/flutterwaveWebhookController');
const squadWebhookController = require('../controllers/squadWebhookController');
const mailchimpWebhookController = require('../controllers/mailchimpWebhookController');

const router = express.Router();

router.get('/mailchimp', mailchimpWebhookController.validateWebhook);
router.post('/mailchimp', mailchimpWebhookController.handleWebhook);
router.get('/mailchimp/:secret', mailchimpWebhookController.validateWebhook);
router.post('/mailchimp/:secret', mailchimpWebhookController.handleWebhook);

router.post('/nowpayments', nowpaymentsWebhookController.handleIpn);
router.post('/flutterwave', flutterwaveWebhookController.handleWebhook);
router.post('/squad', squadWebhookController.handleWebhook);

module.exports = router;
