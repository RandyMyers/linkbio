const crypto = require('crypto');
const WebhookEndpoint = require('../models/WebhookEndpoint');
const { asyncHandler } = require('../middleware/errorHandler');

exports.list = asyncHandler(async (req, res) => {
  const rows = await WebhookEndpoint.find({ userId: req.userId }).sort({ createdAt: -1 }).lean();
  res.json({
    webhooks: rows.map((w) => ({
      id: w._id.toString(),
      url: w.url,
      events: w.events,
      isActive: w.isActive,
      lastDeliveryAt: w.lastDeliveryAt ? new Date(w.lastDeliveryAt).toISOString() : null,
      lastStatus: w.lastStatus,
    })),
  });
});

exports.create = asyncHandler(async (req, res) => {
  const url = String(req.body.url || '').trim();
  if (!url.startsWith('https://')) {
    res.status(400).json({ error: 'Webhook URL must use HTTPS.' });
    return;
  }

  const events = Array.isArray(req.body.events) ? req.body.events.map(String) : ['profile.published'];
  const secret = req.body.secret || crypto.randomBytes(24).toString('hex');

  const row = await WebhookEndpoint.create({
    userId: req.userId,
    url,
    events,
    secret,
    isActive: req.body.isActive !== false,
  });

  res.status(201).json({
    id: row._id.toString(),
    url: row.url,
    events: row.events,
    secret,
    isActive: row.isActive,
  });
});

exports.remove = asyncHandler(async (req, res) => {
  const row = await WebhookEndpoint.findOneAndDelete({ _id: req.params.id, userId: req.userId });
  if (!row) {
    res.status(404).json({ error: 'Webhook not found' });
    return;
  }
  res.json({ ok: true });
});
