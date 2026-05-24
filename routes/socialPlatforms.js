const express = require('express');
const socialPlatformsController = require('../controllers/socialPlatformsController');

const router = express.Router();

router.get('/social-platforms', socialPlatformsController.list);
router.get('/logo', socialPlatformsController.logoForUrl);

module.exports = router;
