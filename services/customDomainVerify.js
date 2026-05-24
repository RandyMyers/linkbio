const crypto = require('crypto');
const dns = require('dns').promises;
const config = require('../config');

function generateVerificationToken() {
  return crypto.randomBytes(16).toString('hex');
}

async function dnsPointsToTarget(hostname) {
  const target = config.customDomainCnameTarget.toLowerCase();
  try {
    const cnames = await dns.resolveCname(hostname);
    if (cnames.some((c) => c.toLowerCase().replace(/\.$/, '') === target)) return true;
  } catch {
    /* fall through */
  }
  try {
    const records = await dns.resolve4(hostname);
    const targetIps = await dns.resolve4(target).catch(() => []);
    if (records.some((ip) => targetIps.includes(ip))) return true;
  } catch {
    /* not verified */
  }
  return false;
}

async function txtRecordMatches(hostname, token) {
  const host = `_linkbio-verify.${hostname}`;
  try {
    const txts = await dns.resolveTxt(host);
    const flat = txts.map((parts) => parts.join('')).join('');
    return flat.includes(token);
  } catch {
    return false;
  }
}

/**
 * DNS verification — CNAME to CUSTOM_DOMAIN_CNAME_TARGET or TXT token.
 */
async function verifyDomainRecord(domainDoc) {
  domainDoc.lastCheckedAt = new Date();
  if (!domainDoc.verificationToken) {
    domainDoc.verificationToken = generateVerificationToken();
  }

  const hostname = domainDoc.hostname;
  const looksValid =
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(hostname) &&
    !hostname.includes('linkbio.app');

  if (!looksValid) {
    domainDoc.status = 'failed';
    domainDoc.failureReason = 'Invalid hostname format.';
    await domainDoc.save();
    return { verified: false, status: domainDoc.status, reason: domainDoc.failureReason };
  }

  if (process.env.DOMAIN_VERIFY_DEV_AUTO === '1') {
    domainDoc.status = 'verified';
    domainDoc.sslStatus = 'pending';
    domainDoc.failureReason = '';
    await domainDoc.save();
    return { verified: true, status: domainDoc.status, instructions: devInstructions(domainDoc) };
  }

  const cnameOk = await dnsPointsToTarget(hostname);
  const txtOk = await txtRecordMatches(hostname, domainDoc.verificationToken);

  if (cnameOk || txtOk) {
    domainDoc.status = 'verified';
    domainDoc.sslStatus = 'pending';
    domainDoc.failureReason = '';
    await domainDoc.save();
    return { verified: true, status: domainDoc.status, instructions: devInstructions(domainDoc) };
  }

  domainDoc.status = 'pending';
  domainDoc.failureReason = 'DNS records not found yet. Add CNAME or TXT and try again.';
  await domainDoc.save();
  return {
    verified: false,
    status: domainDoc.status,
    instructions: devInstructions(domainDoc),
    reason: domainDoc.failureReason,
  };
}

function devInstructions(domainDoc) {
  return {
    type: 'CNAME',
    host: domainDoc.hostname,
    value: 'proxy.linkbio.app',
    txtHost: `_linkbio-verify.${domainDoc.hostname}`,
    txtValue: domainDoc.verificationToken,
  };
}

module.exports = { generateVerificationToken, verifyDomainRecord, devInstructions };
