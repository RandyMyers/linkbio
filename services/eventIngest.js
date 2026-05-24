const crypto = require('crypto');
const BioProfile = require('../models/BioProfile');
const Event = require('../models/Event');
const config = require('../config');
const { normalizeUsername } = require('../lib/reservedUsernames');

const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse|wget|curl/i;

function deviceFromUserAgent(ua) {
  const s = String(ua || '').toLowerCase();
  if (/tablet|ipad/.test(s)) return 'tablet';
  if (/mobile|iphone|android/.test(s)) return 'mobile';
  return 'desktop';
}

function hashVisitor(req) {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const ua = req.headers['user-agent'] || '';
  const day = new Date().toISOString().slice(0, 10);
  return crypto
    .createHash('sha256')
    .update(`${config.eventIpSalt}:${day}:${ip}:${ua}`)
    .digest('hex')
    .slice(0, 32);
}

function isBotRequest(req) {
  const ua = req.headers['user-agent'] || '';
  return BOT_UA.test(ua);
}

async function ingestEvent(req, body) {
  if (isBotRequest(req)) {
    return { ok: true, ignored: true, reason: 'bot' };
  }

  const type = String(body.type || '').toLowerCase();
  if (!['view', 'click'].includes(type)) {
    const err = new Error('Invalid event type');
    err.statusCode = 400;
    throw err;
  }

  const username = normalizeUsername(body.username);
  if (!username) {
    const err = new Error('username required');
    err.statusCode = 400;
    throw err;
  }

  const profile = await BioProfile.findOne({ username }).select('_id suspended').lean();
  if (!profile || profile.suspended) {
    return { ok: true, ignored: true };
  }

  await Event.create({
    profileId: profile._id,
    username,
    type,
    url: String(body.url || '').slice(0, 2048),
    label: String(body.label || '').slice(0, 120),
    blockId: String(body.blockId || '').slice(0, 64),
    sessionId: String(body.sessionId || body.id || '').slice(0, 64),
    visitorId: hashVisitor(req),
    referrer: String(req.headers.referer || body.referrer || '').slice(0, 512),
    country: String(req.headers['cf-ipcountry'] || body.country || '').slice(0, 8),
    device: String(body.device || deviceFromUserAgent(req.headers['user-agent'])).slice(0, 32),
  });

  return { ok: true };
}

module.exports = { ingestEvent, isBotRequest, hashVisitor, deviceFromUserAgent };
