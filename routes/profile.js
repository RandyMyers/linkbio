const express = require('express');
const profileController = require('../controllers/profileController');
const publicProfileController = require('../controllers/publicProfileController');
const usernameController = require('../controllers/usernameController');
const { requireAuth } = require('../middleware/requireAuth');
const { requireActiveProfile } = require('../middleware/requireActiveProfile');

const router = express.Router();

router.get('/username-available', usernameController.checkAvailable);
router.get('/public/by-host', publicProfileController.getByHost);
router.get('/profile/:username', publicProfileController.getByUsername);

router.get('/profile', requireAuth, requireActiveProfile, profileController.getMine);
router.patch('/profile', requireAuth, requireActiveProfile, profileController.patchMine);
router.post('/profile/publish', requireAuth, requireActiveProfile, profileController.publishMine);

module.exports = router;
