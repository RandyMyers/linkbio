const express = require('express');
const blocksController = require('../controllers/blocksController');
const { requireAuth } = require('../middleware/requireAuth');
const { requireActiveProfile } = require('../middleware/requireActiveProfile');

const router = express.Router();

router.put('/blocks/reorder', requireAuth, requireActiveProfile, blocksController.reorder);

module.exports = router;
