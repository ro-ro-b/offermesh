// Persistence smoke — mutate state, kill the server, restart, assert state survived.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 4396;
const BASE = `http://127.0.0.1:${PORT}`;
const KEY = { 'x-offermesh-gateway-key': 'persist-key' };
const stateDir = mkdtempSync(join(tmpdir(), 'offermesh-'));
const statePath = join(stateDir, 'state.json');

let failures = 0;
function assert(name, cond, extra) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name}`, extra ?? ''); }
}
const post = (p, b, h = {}) => fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(b) }).then((r) => r.json());
const get = (p) => fetch(BASE + p).then((r) => r.json());

function start() {
  return spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, PORT: String(PORT), OFFERMESH_GATEWAY_KEY: 'persist-key', OFFERMESH_STATE_PATH: statePath },
    stdio: 'ignore'
  });
}
async function waitUp() {
  for (let i = 0; i < 40; i++) { try { await get('/api/status'); return true; } catch { await sleep(150); } }
  return false;
}

let child = start();
try {
  if (!(await waitUp())) throw new Error('server did not start');

  const seedInfo = await get('/api/seed-info');
  const offerId = seedInfo.offer_ids[0];
  const m = seedInfo.good_mandate_id, a = 'agent:claude-reference';

  await post('/api/agent/reserve', { offerId, mandateId: m, agentId: a }, KEY);
  const red = await post('/api/agent/redeem', { offerId, mandateId: m, agentId: a, idempotencyKey: 'persist-1' }, KEY);
  await post('/api/verify', { receiptId: red.receipt.id });
  const beforeOffer = await get('/api/offers/' + offerId);
  assert('offer settled before restart', beforeOffer.state === 'settled');

  child.kill();
  await sleep(400);
  child = start();
  if (!(await waitUp())) throw new Error('server did not restart');

  const status = await get('/api/status');
  assert('state restored on restart', status.persistence.restored === true);
  const afterOffer = await get('/api/offers/' + offerId);
  assert('settled state survived restart', afterOffer.state === 'settled');
  const receiptAfter = await get('/api/receipts/' + red.receipt.id);
  assert('receipt survived restart, still verified', receiptAfter.verified === true && receiptAfter.receipt_hash === red.receipt.receipt_hash);
  const idem = await post('/api/agent/redeem', { offerId, mandateId: m, agentId: a, idempotencyKey: 'persist-1' }, KEY);
  assert('idempotency map survived restart', idem.idempotent_replay === true && idem.receipt.id === red.receipt.id);
  const report = await get('/api/report/' + seedInfo.program_id);
  assert('ledger survived restart', report.verified_outcomes === 1 && report.escrow.invariant_ok === true);
} catch (err) {
  failures++;
  console.error('FAIL persistence smoke crashed:', err.message);
} finally {
  child.kill();
  rmSync(stateDir, { recursive: true, force: true });
}

if (failures > 0) { console.error(`\npersistence smoke FAILED (${failures})`); process.exit(1); }
console.log('\npersistence smoke PASSED');
