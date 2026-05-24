const express = require('express');
const subscriberController = require('../controllers/subscriberController');
const ogController = require('../controllers/ogController');
const qrController = require('../controllers/qrController');

const router = express.Router();

router.post('/public/:username/subscribe', subscriberController.publicSubscribe);
router.get('/public/:username/seo', ogController.meta);
router.get('/public/:username/qr.svg', qrController.profileQr);

module.exports = router;
