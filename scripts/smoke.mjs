// Full-loop REST smoke against a spawned server instance.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4399;
const BASE = `http://127.0.0.1:${PORT}`;
const KEY = { 'x-offermesh-gateway-key': 'smoke-gateway-key' };

let failures = 0;
function assert(name, cond, extra) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name}`, extra ?? ''); }
}
const post = (p, b, h = {}) => fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(b) }).then(async (r) => ({ code: r.status, body: await r.json() }));
const get = (p) => fetch(BASE + p).then(async (r) => ({ code: r.status, body: await r.json() }));

const child = spawn(process.execPath, ['server.mjs'], {
  cwd: new URL('..', import.meta.url).pathname,
  env: { ...process.env, PORT: String(PORT), OFFERMESH_GATEWAY_KEY: 'smoke-gateway-key', OFFERMESH_EPHEMERAL: '1' },
  stdio: 'ignore'
});

try {
  let up = false;
  for (let i = 0; i < 40 && !up; i++) { try { await get('/api/dual/status'); up = true; } catch { await sleep(150); } }
  if (!up) throw new Error('server did not start');

  // truthful posture
  const status = await get('/api/dual/status');
  assert('dual status read_only + no live writes', status.body.writeMode === 'read_only' && status.body.liveDualWrites === false && status.body.publicWrites === false);
  assert('mapping pending, no credentials', status.body.mainnetMappingPending === true && status.body.credentialStored === false);

  const seedInfo = (await get('/api/seed-info')).body;
  const a = 'agent:claude-reference';
  const m = seedInfo.good_mandate_id;

  // offers + disclosure
  const offers = (await get('/api/offers')).body;
  assert('seeded offers present', offers.count >= 3);
  assert('all offers sponsored=true (disclosure)', offers.offers.every((o) => o.sponsored === true));

  // expired offer lifecycle
  const expired = offers.offers.find((o) => o.title.includes('Expiring'));
  const disc = await post('/api/agent/discover', { offerId: expired.id, agentId: a });
  assert('expired offer reports expired', disc.body.state === 'expired');

  const offerId = seedInfo.offer_ids[0];

  // eligibility gates
  const bad = await post('/api/agent/eligibility', { offerId, mandateId: seedInfo.narrow_mandate_id, agentId: 'agent:narrow-scope' });
  assert('narrow mandate blocked with reasons', bad.body.eligible === false && bad.body.reasons.includes('scope_mismatch') && bad.body.reasons.includes('merchant_not_allowed'));
  const good = await post('/api/agent/eligibility', { offerId, mandateId: m, agentId: a });
  assert('good mandate eligible', good.body.eligible === true);

  // auth fail-closed
  const noAuth = await post('/api/agent/reserve', { offerId, mandateId: m, agentId: a });
  assert('reserve without key -> 401 agent_auth_required', noAuth.code === 401 && noAuth.body.status === 'agent_auth_required');
  const badKey = await post('/api/agent/reserve', { offerId, mandateId: m, agentId: a }, { 'x-offermesh-gateway-key': 'wrong' });
  assert('reserve with wrong key -> 401', badKey.code === 401);

  // reserve + redeem + idempotency
  const resv = await post('/api/agent/reserve', { offerId, mandateId: m, agentId: a }, KEY);
  assert('reserve ok', resv.code === 200 && resv.body.offer.state === 'reserved');
  const red1 = await post('/api/agent/redeem', { offerId, mandateId: m, agentId: a, idempotencyKey: 'smoke-1' }, KEY);
  assert('redeem ok with receipt', red1.code === 200 && red1.body.receipt.receipt_hash.startsWith('0x'));
  const red2 = await post('/api/agent/redeem', { offerId, mandateId: m, agentId: a, idempotencyKey: 'smoke-1' }, KEY);
  assert('idempotent replay same receipt', red2.body.idempotent_replay === true && red2.body.receipt.id === red1.body.receipt.id);
  const red3 = await post('/api/agent/redeem', { offerId, mandateId: m, agentId: a, idempotencyKey: 'smoke-2' }, KEY);
  assert('double redeem with new key blocked', red3.code === 422 && red3.body.code === 'offer_not_reserved');

  // verify -> settle
  const ver = await post('/api/verify', { receiptId: red1.body.receipt.id });
  assert('verify settles', ver.body.verified === true && ver.body.value_released === true);
  const offerAfter = (await get('/api/offers/' + offerId)).body;
  assert('offer settled', offerAfter.state === 'settled');

  // tamper red-team on second offer
  const offer2 = seedInfo.offer_ids[1];
  await post('/api/agent/reserve', { offerId: offer2, mandateId: m, agentId: a }, KEY);
  const redT = await post('/api/agent/redeem', { offerId: offer2, mandateId: m, agentId: a, idempotencyKey: 'smoke-3' }, KEY);
  const tam = await post('/api/verify', { receiptId: redT.body.receipt.id, submittedReceipt: { ...redT.body.receipt, incentive_value: 99999 } });
  assert('tampered receipt flagged, no value released', tam.body.verified === false && tam.body.value_released === false);
  const offer2After = (await get('/api/offers/' + offer2)).body;
  assert('offer flagged for review', offer2After.state === 'flagged_review');
  const disp = await post('/api/dispute', { receiptId: redT.body.receipt.id });
  assert('dispute claws back', disp.body.status === 'clawed_back');

  // per-agent cap: cap=2, already 2 redemptions for this agent
  const mint = await post('/api/offers', { programId: seedInfo.program_id, title: 'cap test', price: 50, incentiveValue: 5, merchant: 'brand:aurora-audio' });
  const cap = await post('/api/agent/eligibility', { offerId: mint.body.id, mandateId: m, agentId: a });
  assert('per-agent cap enforced', cap.body.eligible === false && cap.body.reasons.includes('per_agent_cap_reached'));

  // settlement report
  const report = (await get('/api/report/' + seedInfo.program_id)).body;
  assert('report: 1 verified outcome, spend matches', report.verified_outcomes === 1 && report.outcome_spend === 30);
  assert('report: impressions billed = 0', report.impressions_billed === 0);
  assert('escrow invariant holds', report.escrow.invariant_ok === true);

  // reward epoch simulated only
  const epoch = (await get('/api/reward-epoch/' + seedInfo.program_id)).body;
  assert('reward epoch simulated, non-financial', epoch.simulated === true && epoch.financial_reward === false);

  // proof events exist
  const events = (await get('/api/events')).body;
  assert('proof event log populated', events.count > 10 && events.events.every((e) => e.event_hash.startsWith('0x')));

  // ---- v0.2.0 surface ----
  // sponsored exclusion (principal opt-out)
  const noSpon = await post('/api/agent/eligibility', { offerId: mint.body.id, mandateId: seedInfo.no_sponsored_mandate_id, agentId: 'agent:unsponsored' });
  assert('sponsored excluded by principal', noSpon.body.eligible === false && noSpon.body.reasons.includes('sponsored_offers_excluded_by_principal'));

  // agent simulator (auth-gated)
  const simNoAuth = await post('/api/agent/simulate', { mandateId: m, agentId: a });
  assert('simulate without key -> 401', simNoAuth.code === 401);
  const freshMandate = await post('/api/mandates', { principalRef: 'principal:smoke', agentId: 'agent:sim-smoke', scope: ['redeem_offer'], spendCeiling: 5000, merchantAllowlist: [], expiresAt: '2027-01-01T00:00:00.000Z' });
  const sim = await post('/api/agent/simulate', { mandateId: freshMandate.body.id, agentId: 'agent:sim-smoke' }, KEY);
  assert('agent simulation completes', sim.body.outcome === 'completed' && sim.body.verification.verified === true);
  assert('simulation trace present', Array.isArray(sim.body.trace) && sim.body.trace.some((t) => t.action === 'select'));

  // brand console controls
  const prog2 = await post('/api/programs', { brandRef: 'brand:aurora-audio', name: 'smoke program', budgetEscrow: 100 });
  assert('program created', prog2.code === 201);
  const paused = await post(`/api/programs/${prog2.body.id}/pause`, {});
  assert('program paused', paused.body.state === 'paused');
  const mintPaused = await post('/api/offers', { programId: prog2.body.id, title: 'x', price: 10, incentiveValue: 1 });
  assert('mint blocked on paused program', mintPaused.code === 422 && mintPaused.body.code === 'program_not_active');
  await post(`/api/programs/${prog2.body.id}/resume`, {});
  const topped = await post(`/api/programs/${prog2.body.id}/topup`, { amount: 50 });
  assert('top-up applied', topped.body.budget_escrow === 150);

  // DUAL sync lane fail-closed chain
  const prep = (await get('/api/dual/prepare/' + red1.body.receipt.id)).body;
  assert('dual payload preview, no write', prep.write_executed === false && prep.mapping_pending === true);
  const qNoAuth = await post('/api/dual/queue', { receiptId: red1.body.receipt.id });
  assert('queue without gateway key -> 401', qNoAuth.code === 401);
  const q = await post('/api/dual/queue', { receiptId: red1.body.receipt.id }, KEY);
  assert('verified receipt queued', q.body.status === 'queued');
  const execNoToken = await post('/api/dual/execute/' + q.body.queue_id, { execute_live_dual_write: true });
  assert('execute without operator token fails closed', execNoToken.code === 401 && execNoToken.body.status === 'operator_auth_required');

  // source review bundle + status
  const bundle = (await get('/api/source/review-bundle')).body;
  assert('source review bundle hashes files', bundle.file_count > 10 && bundle.bundle_hash.startsWith('0x'));
  const svc = (await get('/api/status')).body;
  assert('status reports v0.2.0 + gates', svc.version === '0.2.0' && svc.gate.agent_gateway_key_configured === true && svc.gate.operator_token_configured === false);
} catch (err) {
  failures++;
  console.error('FAIL smoke crashed:', err.message);
} finally {
  child.kill();
}

if (failures > 0) { console.error(`\nsmoke FAILED (${failures})`); process.exit(1); }
console.log('\nsmoke PASSED');
