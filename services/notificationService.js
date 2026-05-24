const Notification = require('../models/Notification');
const User = require('../models/User');
const { effectiveSubscriptionPlan } = require('../lib/entitlements');

function subscriptionBillingEnabled(user) {
  if (user.notificationPrefs?.subscriptionBilling === false) return false;
  return true;
}

function dateKey(d) {
  return d.toISOString().slice(0, 10);
}

async function upsertNotification(userId, payload) {
  const doc = await Notification.findOneAndUpdate(
    { userId, dedupKey: payload.dedupKey },
    {
      $setOnInsert: { userId, dedupKey: payload.dedupKey },
      $set: {
        category: payload.category || 'subscription',
        type: payload.type,
        title: payload.title,
        body: payload.body || '',
        linkUrl: payload.linkUrl || '',
        meta: payload.meta || {},
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return doc;
}

async function syncSubscriptionRemindersForUser(user) {
  if (!subscriptionBillingEnabled(user)) {
    return { synced: 0, skipped: 'prefs' };
  }

  const stored =
    typeof user.subscriptionPlan === 'string' ? user.subscriptionPlan.toLowerCase().trim() : 'free';
  const effective = effectiveSubscriptionPlan(user);
  const paidThrough = user.subscriptionPaidThrough ? new Date(user.subscriptionPaidThrough) : null;
  const now = new Date();
  let synced = 0;

  if (stored !== 'free' && paidThrough && !Number.isNaN(paidThrough.getTime())) {
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysLeft = Math.ceil((paidThrough - now) / msPerDay);
    const ptKey = dateKey(paidThrough);
    const planLabel = stored.charAt(0).toUpperCase() + stored.slice(1);
    const renewUrl = '/dashboard/billing';

    const reminders = [];

    if (daysLeft >= 6 && daysLeft <= 7) {
      reminders.push({
        type: 'subscription_expiring_7d',
        dedupKey: `subscription:expiring_7d:${ptKey}`,
        title: `${planLabel} renews in about a week`,
        body: `Your subscription ends on ${paidThrough.toLocaleDateString(undefined, { dateStyle: 'medium' })}. Renew to keep your ${planLabel} features.`,
        linkUrl: renewUrl,
      });
    }

    if (daysLeft === 1) {
      reminders.push({
        type: 'subscription_expiring_1d',
        dedupKey: `subscription:expiring_1d:${ptKey}`,
        title: `${planLabel} ends tomorrow`,
        body: 'Renew now so your page keeps premium features without interruption.',
        linkUrl: renewUrl,
      });
    }

    if (daysLeft === 0) {
      reminders.push({
        type: 'subscription_expiring_today',
        dedupKey: `subscription:expiring_today:${ptKey}`,
        title: `${planLabel} ends today`,
        body: 'Your billing period ends today. Renew from Billing to stay on your current plan.',
        linkUrl: renewUrl,
      });
    }

    if (user.cancelAtPeriodEnd && daysLeft >= 0 && daysLeft <= 7) {
      reminders.push({
        type: 'subscription_cancel_scheduled',
        dedupKey: `subscription:cancel_scheduled:${ptKey}`,
        title: 'Cancellation scheduled',
        body: `You will move to Free after ${paidThrough.toLocaleDateString(undefined, { dateStyle: 'medium' })} unless you resume your subscription.`,
        linkUrl: renewUrl,
      });
    }

    for (const r of reminders) {
      await upsertNotification(user._id, {
        ...r,
        category: 'subscription',
        meta: { planSlug: stored, paidThrough: paidThrough.toISOString(), daysLeft },
      });
      synced += 1;
    }
  }

  if (stored !== 'free' && effective === 'free' && paidThrough && paidThrough < now) {
    const daysSince = Math.floor((now - paidThrough) / (24 * 60 * 60 * 1000));
    if (daysSince >= 0 && daysSince <= 3) {
      await upsertNotification(user._id, {
        category: 'subscription',
        type: 'subscription_expired',
        dedupKey: `subscription:expired:${dateKey(paidThrough)}`,
        title: 'Your subscription has ended',
        body: 'Renew your plan to restore premium themes, analytics, and other paid features.',
        linkUrl: '/dashboard/billing?renew=1',
        meta: { planSlug: stored, paidThrough: paidThrough.toISOString(), daysSince },
      });
      synced += 1;
    }
  }

  return { synced };
}

async function syncSubscriptionRemindersForAllUsers() {
  const users = await User.find({
    subscriptionPlan: { $nin: ['', 'free'] },
  })
    .select(
      'subscriptionPlan subscriptionPaidThrough subscriptionStatus notificationPrefs cancelAtPeriodEnd',
    )
    .lean();

  let total = 0;
  for (const row of users) {
    const user = await User.findById(row._id);
    if (!user) continue;
    const { synced } = await syncSubscriptionRemindersForUser(user);
    total += synced;
  }
  return { users: users.length, notificationsUpserted: total };
}

function serializeNotification(doc) {
  return {
    id: doc._id.toString(),
    category: doc.category,
    type: doc.type,
    title: doc.title,
    body: doc.body || '',
    linkUrl: doc.linkUrl || '',
    readAt: doc.readAt ? new Date(doc.readAt).toISOString() : null,
    meta: doc.meta || {},
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
  };
}

async function listNotifications(userId, { limit = 20, unreadOnly = false } = {}) {
  const q = { userId };
  if (unreadOnly) q.readAt = null;
  const rows = await Notification.find(q).sort({ createdAt: -1 }).limit(Math.min(50, limit)).lean();
  return rows.map((r) =>
    serializeNotification({
      ...r,
      _id: r._id,
    }),
  );
}

async function unreadCount(userId) {
  return Notification.countDocuments({ userId, readAt: null });
}

async function markRead(userId, notificationId) {
  const doc = await Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { $set: { readAt: new Date() } },
    { new: true },
  );
  if (!doc) return null;
  return serializeNotification(doc);
}

async function markAllRead(userId) {
  const result = await Notification.updateMany(
    { userId, readAt: null },
    { $set: { readAt: new Date() } },
  );
  return { modified: result.modifiedCount || 0 };
}

module.exports = {
  subscriptionBillingEnabled,
  upsertNotification,
  syncSubscriptionRemindersForUser,
  syncSubscriptionRemindersForAllUsers,
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
  serializeNotification,
};
