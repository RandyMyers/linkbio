const express = require('express');
const commerceController = require('../controllers/commerceController');
const { requireAuth } = require('../middleware/requireAuth');
const { requireActiveProfile } = require('../middleware/requireActiveProfile');

const router = express.Router();

router.post('/public/:username/checkout', commerceController.productCheckout);
router.get('/commerce/summary', requireAuth, requireActiveProfile, commerceController.summary);
router.get('/commerce/orders', requireAuth, requireActiveProfile, commerceController.orders);

module.exports = router;
