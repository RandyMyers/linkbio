const express = require('express');
const uploadController = require('../controllers/uploadController');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.post('/upload/avatar', requireAuth, uploadController.uploadAvatar);
router.post('/upload/image', requireAuth, uploadController.uploadImage);

module.exports = router;
