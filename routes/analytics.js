const express = require('express');
const analyticsController = require('../controllers/analyticsController');
const { requireAuth } = require('../middleware/requireAuth');
const { requireActiveProfile } = require('../middleware/requireActiveProfile');

const router = express.Router();

router.get('/analytics/summary', requireAuth, requireActiveProfile, analyticsController.summary);
router.get('/analytics/dashboard', requireAuth, requireActiveProfile, analyticsController.summary);
router.get('/analytics/clicks', requireAuth, requireActiveProfile, analyticsController.clicks);
router.get('/analytics/export.csv', requireAuth, requireActiveProfile, analyticsController.exportCsv);

module.exports = router;
