const express = require('express');
const accountController = require('../controllers/accountController');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.get('/account', requireAuth, accountController.getAccount);
router.patch('/account', requireAuth, accountController.patchAccount);
router.post('/account/password', requireAuth, accountController.changePassword);
router.delete('/account', requireAuth, accountController.deleteAccount);
router.post('/auth/forgot-password', accountController.requestPasswordReset);
router.post('/auth/reset-password', accountController.resetPassword);

module.exports = router;
