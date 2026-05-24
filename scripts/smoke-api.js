/**
 * Quick API smoke test — run with server on PORT (default 4000).
 * node scripts/smoke-api.js
 */
const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4000';

async function run() {
  const health = await fetch(`${base}/health`);
  console.log('health', health.status, await health.json());

  const plans = await fetch(`${base}/api/plans`);
  console.log('plans', plans.status, (await plans.json()).plans?.length);

  const robots = await fetch(`${base}/robots.txt`);
  console.log('robots', robots.status, (await robots.text()).slice(0, 40));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
