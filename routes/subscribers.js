const express = require('express');
const subscriberController = require('../controllers/subscriberController');
const { requireAuth } = require('../middleware/requireAuth');
const { requireActiveProfile } = require('../middleware/requireActiveProfile');

const router = express.Router();

router.get('/subscribers', requireAuth, requireActiveProfile, subscriberController.listMine);
router.get('/subscribers/export.csv', requireAuth, requireActiveProfile, subscriberController.exportCsv);
router.delete('/subscribers/:id', requireAuth, requireActiveProfile, subscriberController.unsubscribe);

module.exports = router;
