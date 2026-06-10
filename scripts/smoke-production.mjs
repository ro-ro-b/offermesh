// Read-only production-readiness smoke. Local by default; set REVOLV_SMOKE_BASE for hosted.
const BASE = (process.env.REVOLV_SMOKE_BASE || 'http://127.0.0.1:4397').replace(/\/+$/, '');
const shouldSpawn = !process.env.REVOLV_SMOKE_BASE;

let child = null;
if (shouldSpawn) {
  const { spawn } = await import('node:child_process');
  child = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: {
      ...process.env,
      PORT: '4397',
      OFFERMESH_EPHEMERAL: '1',
      OFFERMESH_GATEWAY_KEY: 'prod-smoke-key',
      OFFERMESH_ADMIN_TOKEN: 'prod-smoke-admin',
      KV_REST_API_URL: '',
      KV_REST_API_TOKEN: '',
      UPSTASH_REDIS_REST_URL: '',
      UPSTASH_REDIS_REST_TOKEN: ''
    },
    stdio: 'ignore'
  });
}

let failures = 0;
function assert(name, cond, extra) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name}`, extra ?? ''); }
}

const get = (p) => fetch(BASE + p).then(async (r) => ({ code: r.status, body: await r.json().catch(() => ({})) }));

try {
  for (let i = 0; i < 40; i++) {
    try { await get('/api/status'); break; } catch {
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  const status = await get('/api/status');
  assert('status is v0.5.0 Revolv', status.body.version === '0.5.0' && status.body.product === 'revolv' && status.body.engine === 'offermesh', status.body);
  assert('DUAL remains read-only', status.body.dual?.writeMode === 'read_only' && status.body.dual?.liveDualWrites === false && status.body.dual?.publicWrites === false, status.body.dual);

  const monitor = await get('/api/ops/monitor');
  assert('monitor green', monitor.body.ok === true, monitor.body);

  const readiness = await get('/api/ops/readiness');
  const readinessItems = Object.fromEntries((readiness.body.items || []).map((i) => [i.id, i.status]));
  assert('scoped Cowork pass recorded', readinessItems.external_review_gate === 'done', readinessItems);
  assert('broad production gate pending', readinessItems.broad_production_review_gate === 'pending', readinessItems);

  const prod = await get('/api/ops/production-readiness');
  assert('production readiness endpoint explicit', prod.body.state === 'production_pilot_incomplete' && prod.body.production_ready_claim_allowed === false, prod.body);
  assert('production blockers include broad Cowork review', prod.body.blockers.includes('broad_production_cowork_review'), prod.body.blockers);

  const identity = await get('/api/product/public-identity');
  assert('canonical public URL is explicit', identity.body.canonical_public_url.endsWith('/revolv'), identity.body);

  const session = await get('/api/auth/session');
  assert('OIDC fails closed unless bound', [401, 403].includes(session.code), session.body);

  const bundle = await get('/api/source/review-bundle');
  assert('source bundle versioned', bundle.body.service_version === '0.5.0' && bundle.body.bundle_hash?.startsWith('0x'), bundle.body);
} catch (err) {
  failures++;
  console.error('FAIL production smoke crashed:', err.message);
} finally {
  if (child) child.kill();
}

if (failures > 0) { console.error(`\nproduction smoke FAILED (${failures})`); process.exit(1); }
console.log('\nproduction smoke PASSED');
