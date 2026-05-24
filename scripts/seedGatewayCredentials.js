#!/usr/bin/env node
/**
 * Seed encrypted gateway credentials from gateway keys.txt (or GATEWAY_KEYS_FILE).
 *
 * Usage (from linkbio/server):
 *   node scripts/seedGatewayCredentials.js
 *   node scripts/seedGatewayCredentials.js "../gateway keys.txt"
 *   node scripts/seedGatewayCredentials.js --dry-run
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { connectDb } = require('../lib/db');
const GatewayCredential = require('../models/GatewayCredential');
const { encryptSecret, maskSecret } = require('../lib/secretCrypto');
const { parseGatewayKeysFile } = require('../lib/parseGatewayKeysFile');
const { invalidateGatewayCache } = require('../services/gatewayConfig');

const DEFAULT_FILE = path.resolve(__dirname, '../../gateway keys.txt');

function buildPayload(entry) {
  const payload = { apiKey: entry.apiKey };
  if (entry.ipnSecret) payload.ipnSecret = entry.ipnSecret;
  if (entry.publicKey) payload.publicKey = entry.publicKey;
  if (entry.publishableKey) {
    payload.publishableKey = entry.publishableKey;
    payload.publicKey = entry.publicKey || entry.publishableKey;
  }
  return payload;
}

async function upsertGateway(entry) {
  const payload = JSON.stringify(buildPayload(entry));
  const enc = encryptSecret(payload, config.secretsMasterKey);

  const doc = await GatewayCredential.findOneAndUpdate(
    { provider: entry.provider, environment: entry.environment },
    {
      $set: {
        label: entry.label,
        environment: entry.environment,
        encryptedValue: enc.encryptedValue,
        iv: enc.iv,
        authTag: enc.authTag,
        maskedApiKey: maskSecret(entry.apiKey),
        isActive: true,
        lastRotatedAt: new Date(),
        updatedBy: 'seedGatewayCredentials',
      },
      $setOnInsert: {
        provider: entry.provider,
        createdBy: 'seedGatewayCredentials',
      },
    },
    { upsert: true, new: true },
  );

  return doc;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const fileArg = args.find((a) => !a.startsWith('--'));
  const keysFile = path.resolve(
    fileArg || process.env.GATEWAY_KEYS_FILE || DEFAULT_FILE,
  );

  if (!config.secretsMasterKey) {
    console.error('[seed:gateways] SECRETS_MASTER_KEY is not set in server/.env');
    process.exit(1);
  }

  if (!fs.existsSync(keysFile)) {
    console.error(`[seed:gateways] Keys file not found: ${keysFile}`);
    process.exit(1);
  }

  const text = fs.readFileSync(keysFile, 'utf8');
  const entries = parseGatewayKeysFile(text);

  if (!entries.length) {
    console.error('[seed:gateways] No gateway entries parsed from file.');
    process.exit(1);
  }

  console.log(`[seed:gateways] Parsed ${entries.length} gateway(s) from ${keysFile}`);
  for (const entry of entries) {
    console.log(
      `  - ${entry.provider} (${entry.environment}) apiKey=${maskSecret(entry.apiKey)}`,
    );
  }

  if (dryRun) {
    console.log('[seed:gateways] Dry run — no database writes.');
    return;
  }

  await connectDb();

  for (const entry of entries) {
    await upsertGateway(entry);
    console.log(`[seed:gateways] Upserted ${entry.provider} (${entry.environment})`);
  }

  // Remove Stripe production row if we only seeded sandbox (mis-seeded earlier).
  const hasStripeSandbox = entries.some(
    (e) => e.provider === 'stripe' && e.environment === 'sandbox',
  );
  if (hasStripeSandbox) {
    const removed = await GatewayCredential.findOneAndDelete({
      provider: 'stripe',
      environment: 'production',
    });
    if (removed) {
      console.log('[seed:gateways] Removed stale stripe (production) credentials');
    }
  }

  invalidateGatewayCache();
  console.log('[seed:gateways] Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed:gateways]', err.message || err);
  process.exit(1);
});
