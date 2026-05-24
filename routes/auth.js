const express = require('express');
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/me', requireAuth, authController.me);
router.post('/logout', requireAuth, authController.logout);
router.post('/complete-onboarding', requireAuth, authController.completeOnboarding);

module.exports = router;
