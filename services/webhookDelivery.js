const crypto = require('crypto');
const WebhookEndpoint = require('../models/WebhookEndpoint');

async function deliverWebhooks(userId, event, payload) {
  const endpoints = await WebhookEndpoint.find({
    userId,
    isActive: true,
    events: event,
  }).lean();

  await Promise.all(
    endpoints.map(async (ep) => {
      const body = JSON.stringify({ event, payload, sentAt: new Date().toISOString() });
      const headers = { 'Content-Type': 'application/json' };
      if (ep.secret) {
        const sig = crypto.createHmac('sha256', ep.secret).update(body).digest('hex');
        headers['X-LinkBio-Signature'] = sig;
      }
      try {
        const res = await fetch(ep.url, { method: 'POST', headers, body });
        await WebhookEndpoint.updateOne(
          { _id: ep._id },
          { lastDeliveryAt: new Date(), lastStatus: res.status },
        );
      } catch {
        await WebhookEndpoint.updateOne({ _id: ep._id }, { lastDeliveryAt: new Date(), lastStatus: 0 });
      }
    }),
  );
}

module.exports = { deliverWebhooks };
