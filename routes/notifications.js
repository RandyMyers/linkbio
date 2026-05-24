const express = require('express');
const notificationsController = require('../controllers/notificationsController');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.get('/notifications', requireAuth, notificationsController.listNotifications);
router.get('/notifications/unread-count', requireAuth, notificationsController.getUnreadCount);
router.post('/notifications/read-all', requireAuth, notificationsController.markAllRead);
router.post('/notifications/:id/read', requireAuth, notificationsController.markRead);

module.exports = router;
