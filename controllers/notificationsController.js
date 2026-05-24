const User = require('../models/User');
const {
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
  syncSubscriptionRemindersForUser,
} = require('../services/notificationService');
const { asyncHandler } = require('../middleware/errorHandler');

exports.listNotifications = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  await syncSubscriptionRemindersForUser(user);

  const limit = Math.min(50, Number(req.query.limit) || 20);
  const unreadOnly = req.query.unreadOnly === '1' || req.query.unreadOnly === 'true';
  const notifications = await listNotifications(req.userId, { limit, unreadOnly });
  const unread = await unreadCount(req.userId);

  res.json({ notifications, unreadCount: unread });
});

exports.getUnreadCount = asyncHandler(async (req, res) => {
  const count = await unreadCount(req.userId);
  res.json({ unreadCount: count });
});

exports.markRead = asyncHandler(async (req, res) => {
  const doc = await markRead(req.userId, req.params.id);
  if (!doc) {
    res.status(404).json({ error: 'Notification not found' });
    return;
  }
  const unread = await unreadCount(req.userId);
  res.json({ notification: doc, unreadCount: unread });
});

exports.markAllRead = asyncHandler(async (req, res) => {
  const result = await markAllRead(req.userId);
  res.json({ ok: true, ...result, unreadCount: 0 });
});
