const crypto = require('crypto');
const config = require('../config');

function getKey() {
  const raw = config.secretsMasterKey || '';
  if (!raw || raw.length < 16) return null;
  return crypto.createHash('sha256').update(raw).digest();
}

function encryptJson(obj) {
  const key = getKey();
  if (!key || !obj || typeof obj !== 'object') return obj;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plain = JSON.stringify(obj);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    __enc: true,
    v: 1,
    data: enc.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

function decryptJson(stored) {
  const key = getKey();
  if (!stored || !stored.__enc || !key) return stored;
  try {
    const iv = Buffer.from(stored.iv, 'base64');
    const tag = Buffer.from(stored.tag, 'base64');
    const data = Buffer.from(stored.data, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    return JSON.parse(plain);
  } catch {
    return {};
  }
}

module.exports = { encryptJson, decryptJson };
