const express = require('express');
const webhooksOutController = require('../controllers/webhooksOutController');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.get('/webhooks', requireAuth, webhooksOutController.list);
router.post('/webhooks', requireAuth, webhooksOutController.create);
router.delete('/webhooks/:id', requireAuth, webhooksOutController.remove);

module.exports = router;
