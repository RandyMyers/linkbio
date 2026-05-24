const express = require('express');
const domainController = require('../controllers/domainController');
const { requireAuth } = require('../middleware/requireAuth');
const { requireActiveProfile } = require('../middleware/requireActiveProfile');

const router = express.Router();

router.get('/domains', requireAuth, domainController.list);
router.post('/domains', requireAuth, requireActiveProfile, domainController.create);
router.post('/domains/:id/verify', requireAuth, domainController.verify);
router.delete('/domains/:id', requireAuth, domainController.remove);

module.exports = router;
