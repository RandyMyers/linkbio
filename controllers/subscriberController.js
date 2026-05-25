const BioProfile = require('../models/BioProfile');
const Subscriber = require('../models/Subscriber');
const User = require('../models/User');
const { normalizeUsername } = require('../lib/reservedUsernames');
const { deliverWebhooks } = require('../services/webhookDelivery');
const { asyncHandler } = require('../middleware/errorHandler');

exports.publicSubscribe = asyncHandler(async (req, res) => {
  const username = normalizeUsername(req.params.username);
  const email = String(req.body.email || '').trim().toLowerCase();
  const name = String(req.body.name || '').trim().slice(0, 120);
  const blockId = String(req.body.blockId || '').slice(0, 64);

  if (!username || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Valid username and email required.' });
    return;
  }

  const profile = await BioProfile.findOne({ username }).select('userId _id suspended').lean();
  if (!profile || profile.suspended) {
    res.status(404).json({ error: 'Profile not found' });
    return;
  }

  const existing = await Subscriber.findOne({ profileId: profile._id, email });
  if (existing && !existing.unsubscribedAt) {
    res.status(200).json({ ok: true, message: 'Already subscribed.' });
    return;
  }

  const row =
    existing ||
    (await Subscriber.create({
      profileId: profile._id,
      username,
      email,
      name,
      blockId,
      consentAt: new Date(),
    }));

  if (existing?.unsubscribedAt) {
    existing.unsubscribedAt = null;
    existing.name = name || existing.name;
    await existing.save();
  }

  await deliverWebhooks(profile.userId, 'subscriber.created', {
    email,
    username,
    blockId,
    subscriberId: row._id.toString(),
  });

  const { syncLeadFromNewsletterSubscriber } = require('../services/marketingLeadSync');
  syncLeadFromNewsletterSubscriber({ email, name, username }).catch(() => {});

  res.status(201).json({ ok: true });
});

exports.listMine = asyncHandler(async (req, res) => {
  const profile = req.profile;

  const rows = await Subscriber.find({ profileId: profile._id, unsubscribedAt: null })
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();

  res.json({
    subscribers: rows.map((s) => ({
      id: s._id.toString(),
      email: s.email,
      name: s.name,
      blockId: s.blockId,
      createdAt: s.createdAt ? new Date(s.createdAt).toISOString() : null,
    })),
  });
});

exports.exportCsv = asyncHandler(async (req, res) => {
  const profile = req.profile;

  const rows = await Subscriber.find({ profileId: profile._id, unsubscribedAt: null })
    .sort({ createdAt: -1 })
    .lean();

  const lines = ['email,name,blockId,createdAt', ...rows.map((s) => {
    const email = `"${s.email.replace(/"/g, '""')}"`;
    const name = `"${(s.name || '').replace(/"/g, '""')}"`;
    return `${email},${name},${s.blockId || ''},${s.createdAt ? new Date(s.createdAt).toISOString() : ''}`;
  })];

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="subscribers.csv"');
  res.send(lines.join('\n'));
});

exports.unsubscribe = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const profile = req.profile;
  const row = await Subscriber.findOne({ _id: id, profileId: profile._id });
  if (!row) {
    res.status(404).json({ error: 'Subscriber not found' });
    return;
  }
  row.unsubscribedAt = new Date();
  await row.save();
  res.json({ ok: true });
});
