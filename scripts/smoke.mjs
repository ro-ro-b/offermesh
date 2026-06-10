// Full-loop REST smoke against a spawned server instance — v0.5.3 partner story UX + claim lane included.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4399;
const BASE = `http://127.0.0.1:${PORT}`;
const KEY = { 'x-offermesh-gateway-key': 'smoke-gateway-key' };
const CONSOLE = { 'x-offermesh-tenant-key': 'smoke-console-key' };
const ADMIN = { 'x-offermesh-admin-token': 'smoke-admin-token' };

let failures = 0;
function assert(name, cond, extra) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name}`, extra ?? ''); }
}
const post = (p, b, h = {}) => fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(b) }).then(async (r) => ({ code: r.status, body: await r.json(), headers: r.headers }));
const get = (p, h = {}) => fetch(BASE + p, { headers: h }).then(async (r) => ({ code: r.status, body: await r.json(), headers: r.headers }));
const getText = (p, h = {}) => fetch(BASE + p, { headers: h }).then(async (r) => ({ code: r.status, body: await r.text(), headers: r.headers }));

const child = spawn(process.execPath, ['server.mjs'], {
  cwd: new URL('..', import.meta.url).pathname,
  env: {
    ...process.env, PORT: String(PORT), OFFERMESH_EPHEMERAL: '1',
    KV_REST_API_URL: '', KV_REST_API_TOKEN: '', UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '',
    OFFERMESH_GATEWAY_KEY: 'smoke-gateway-key',
    OFFERMESH_DEMO_CONSOLE_KEY: 'smoke-console-key',
    OFFERMESH_ADMIN_TOKEN: 'smoke-admin-token'
  },
  stdio: 'ignore'
});

try {
  let up = false;
  for (let i = 0; i < 40 && !up; i++) { try { await get('/api/dual/status'); up = true; } catch { await sleep(150); } }
  if (!up) throw new Error('server did not start');

  // truthful posture + service status
  const status = await get('/api/status');
  assert('status v0.5.3', status.body.version === '0.5.3', status.body.version);
  assert('product is Revolv with OfferMesh engine', status.body.product === 'revolv' && status.body.engine === 'offermesh', status.body);
  assert('gates configured', status.body.gate.admin_token_configured === true && status.body.gate.operator_token_configured === false);
  const revolvPage = await getText('/revolv');
  assert('/revolv public route serves DUAL UI standard', revolvPage.code === 200 && revolvPage.body.includes('<h1>Revolv</h1>') && revolvPage.body.includes('DUAL UI standard'));
  assert('/revolv public route explains partner story', revolvPage.body.includes('Replace ad inventory with a proof-backed offer loop.') && revolvPage.body.includes('What a partner can test today'));
  const dual = await get('/api/dual/status');
  assert('dual read_only, no live writes', dual.body.writeMode === 'read_only' && dual.body.liveDualWrites === false && dual.body.publicWrites === false);
  assert('dual status carries product/engine boundary', dual.body.product === 'revolv' && dual.body.engine === 'offermesh');

  // security headers + request id
  assert('security headers present', status.headers.get('x-content-type-options') === 'nosniff' && Boolean(status.headers.get('content-security-policy')) && status.headers.get('x-frame-options') === 'DENY');
  assert('request id present', Boolean(status.headers.get('x-request-id')));

  const seedInfo = (await get('/api/seed-info')).body;
  const a = 'agent:claude-reference';
  const m = seedInfo.good_mandate_id;
  const offerId = seedInfo.offer_ids[0];

  // offers + disclosure + expiry
  const offers = (await get('/api/offers')).body;
  assert('seeded offers present', offers.count >= 3);
  assert('all offers sponsored=true (disclosure)', offers.offers.every((o) => o.sponsored === true));
  const expired = offers.offers.find((o) => o.title.includes('Expiring'));
  const disc = await post('/api/agent/discover', { offerId: expired.id, agentId: a });
  assert('expired offer reports expired', disc.body.state === 'expired');

  // eligibility gates
  const bad = await post('/api/agent/eligibility', { offerId, mandateId: seedInfo.narrow_mandate_id, agentId: 'agent:narrow-scope' });
  assert('narrow mandate blocked', bad.body.eligible === false && bad.body.reasons.includes('scope_mismatch'));
  const noSpon = await post('/api/agent/eligibility', { offerId, mandateId: seedInfo.no_sponsored_mandate_id, agentId: 'agent:unsponsored' });
  assert('sponsored excluded by principal', noSpon.body.eligible === false && noSpon.body.reasons.includes('sponsored_offers_excluded_by_principal'));

  // agent auth fail-closed
  const noAuth = await post('/api/agent/reserve', { offerId, mandateId: m, agentId: a });
  assert('reserve without key -> 401 agent_auth_required', noAuth.code === 401 && noAuth.body.status === 'agent_auth_required');
  const badKey = await post('/api/agent/reserve', { offerId, mandateId: m, agentId: a }, { 'x-offermesh-gateway-key': 'wrong' });
  assert('reserve with wrong key -> 401', badKey.code === 401);

  // reserve/redeem/idempotency/verify
  const resv = await post('/api/agent/reserve', { offerId, mandateId: m, agentId: a }, KEY);
  assert('reserve ok', resv.code === 200 && resv.body.offer.state === 'reserved');
  const red1 = await post('/api/agent/redeem', { offerId, mandateId: m, agentId: a, idempotencyKey: 'smoke-1' }, KEY);
  assert('redeem ok', red1.code === 200 && red1.body.receipt.receipt_hash.startsWith('0x'));
  const red2 = await post('/api/agent/redeem', { offerId, mandateId: m, agentId: a, idempotencyKey: 'smoke-1' }, KEY);
  assert('idempotent replay', red2.body.idempotent_replay === true && red2.body.receipt.id === red1.body.receipt.id);
  const ver = await post('/api/verify', { receiptId: red1.body.receipt.id });
  assert('verify settles', ver.body.verified === true && ver.body.value_released === true);

  // tamper red-team
  const offer2 = seedInfo.offer_ids[1];
  await post('/api/agent/reserve', { offerId: offer2, mandateId: m, agentId: a }, KEY);
  const redT = await post('/api/agent/redeem', { offerId: offer2, mandateId: m, agentId: a, idempotencyKey: 'smoke-3' }, KEY);
  const tam = await post('/api/verify', { receiptId: redT.body.receipt.id, submittedReceipt: { ...redT.body.receipt, incentive_value: 99999 } });
  assert('tampered receipt flagged, no value', tam.body.verified === false && tam.body.value_released === false);
  const disp = await post('/api/dispute', { receiptId: redT.body.receipt.id });
  assert('dispute claws back', disp.body.status === 'clawed_back');

  // ---- console auth (tenant API key) ----
  const noTenant = await post('/api/offers', { programId: seedInfo.program_id, title: 'x', price: 50, incentiveValue: 5 });
  assert('console write without tenant key -> 401 tenant_auth_required', noTenant.code === 401 && noTenant.body.status === 'tenant_auth_required');
  const mint = await post('/api/offers', { programId: seedInfo.program_id, title: 'cap test', price: 50, incentiveValue: 5, merchant: 'brand:aurora-audio' }, CONSOLE);
  assert('console write with demo tenant key ok', mint.code === 201);
  const cap = await post('/api/agent/eligibility', { offerId: mint.body.id, mandateId: m, agentId: a });
  assert('per-agent cap enforced', cap.body.eligible === false && cap.body.reasons.includes('per_agent_cap_reached'));

  // program controls under tenant auth
  const prog2 = await post('/api/programs', { brandRef: 'brand:aurora-audio', name: 'smoke program', budgetEscrow: 100 }, CONSOLE);
  assert('program created', prog2.code === 201 && prog2.body.tenant_id);
  const paused = await post(`/api/programs/${prog2.body.id}/pause`, {}, CONSOLE);
  assert('program paused', paused.body.state === 'paused');
  await post(`/api/programs/${prog2.body.id}/resume`, {}, CONSOLE);
  const topped = await post(`/api/programs/${prog2.body.id}/topup`, { amount: 50 }, CONSOLE);
  assert('top-up applied', topped.body.budget_escrow === 150);

  // input validation
  const badNum = await post('/api/offers', { programId: seedInfo.program_id, title: 'x', price: -5, incentiveValue: 5 }, CONSOLE);
  assert('validation rejects bad number', badNum.code === 422);
  const badStr = await post('/api/programs', { brandRef: 'brand:aurora-audio', name: 'x'.repeat(500), budgetEscrow: 10 }, CONSOLE);
  assert('validation rejects oversized string', badStr.code === 422);

  // ---- admin plane ----
  const adminNo = await get('/api/admin/tenants');
  assert('admin without token -> 401', adminNo.code === 401);
  const tnt = await post('/api/admin/tenants', { name: 'Smoke Brand Co' }, ADMIN);
  assert('tenant created with one-time keys', tnt.code === 201 && tnt.body.api_key.startsWith('omk_') && tnt.body.gateway_key.startsWith('omg_'));
  const tlist = await get('/api/admin/tenants', ADMIN);
  assert('tenant list has no raw keys', tlist.code === 200 && !JSON.stringify(tlist.body).includes('omk_') && !JSON.stringify(tlist.body).includes('omg_'));

  const TKEY = { 'x-offermesh-tenant-key': tnt.body.api_key };
  const GKEY = { 'x-offermesh-gateway-key': tnt.body.gateway_key };
  const me = await get('/api/tenant/me', TKEY);
  assert('tenant self-service works', me.code === 200 && me.body.id === tnt.body.tenant.id);

  // new tenant full loop: brand -> program -> offer -> agent redeem with tenant gateway key
  await post('/api/brands', { name: 'Smoke Brand', ref: 'brand:smoke' }, TKEY);
  const tprog = await post('/api/programs', { brandRef: 'brand:smoke', name: 'Smoke Outcomes', budgetEscrow: 200 }, TKEY);
  assert('tenant program created', tprog.code === 201 && tprog.body.tenant_id === tnt.body.tenant.id);
  const toffer = await post('/api/offers', { programId: tprog.body.id, title: 'Smoke offer', price: 100, incentiveValue: 20, merchant: 'brand:smoke' }, TKEY);
  assert('tenant offer minted', toffer.code === 201);
  const crossTenant = await post('/api/offers', { programId: tprog.body.id, title: 'x', price: 10, incentiveValue: 1 }, CONSOLE);
  assert('cross-tenant mint blocked', crossTenant.code === 403 && crossTenant.body.status === 'wrong_tenant_for_program');

  const tmandate = await post('/api/mandates', { principalRef: 'principal:smoke', agentId: 'agent:smoke-t', scope: ['redeem_offer'], spendCeiling: 500, merchantAllowlist: ['brand:smoke'], expiresAt: '2027-01-01T00:00:00.000Z' });
  await post('/api/agent/reserve', { offerId: toffer.body.id, mandateId: tmandate.body.id, agentId: 'agent:smoke-t' }, GKEY);
  const tred = await post('/api/agent/redeem', { offerId: toffer.body.id, mandateId: tmandate.body.id, agentId: 'agent:smoke-t', idempotencyKey: 'smoke-t1' }, GKEY);
  assert('tenant gateway key redeems', tred.code === 200);
  await post('/api/verify', { receiptId: tred.body.receipt.id });

  // metering
  const usage = await get('/api/tenant/usage', TKEY);
  const monthRow = usage.body.months[0];
  assert('usage metered per tenant', usage.code === 200 && monthRow.offers_minted >= 1 && monthRow.redemptions >= 1 && monthRow.verified_outcomes >= 1 && monthRow.outcome_spend >= 20, JSON.stringify(monthRow));
  const month = new Date().toISOString().slice(0, 7);
  const bill = await get(`/api/tenant/billing/${month}`, TKEY);
  assert('billing record hashed, processor excluded', bill.code === 200 && bill.body.record_hash.startsWith('0x') && bill.body.payment_processor === 'none_excluded_this_phase');

  // suspend blocks both planes; rotate invalidates old keys
  await post(`/api/admin/tenants/${tnt.body.tenant.id}/suspend`, {}, ADMIN);
  const suspended = await get('/api/tenant/me', TKEY);
  assert('suspended tenant blocked', suspended.code === 403);
  const suspendedGw = await post('/api/agent/reserve', { offerId: toffer.body.id, mandateId: tmandate.body.id, agentId: 'agent:smoke-t' }, GKEY);
  assert('suspended gateway key blocked', suspendedGw.code === 401);
  await post(`/api/admin/tenants/${tnt.body.tenant.id}/resume`, {}, ADMIN);
  const rotated = await post(`/api/admin/tenants/${tnt.body.tenant.id}/rotate`, {}, ADMIN);
  const oldKeyAfterRotate = await get('/api/tenant/me', TKEY);
  assert('rotation invalidates old key', oldKeyAfterRotate.code === 401);
  const newKeyWorks = await get('/api/tenant/me', { 'x-offermesh-tenant-key': rotated.body.api_key });
  assert('rotated key works', newKeyWorks.code === 200);

  // settlement report still per verified outcome
  const report = (await get('/api/report/' + seedInfo.program_id)).body;
  assert('report: impressions billed = 0, escrow invariant', report.impressions_billed === 0 && report.escrow.invariant_ok === true);

  // ops + readiness truthfulness
  const mon = await get('/api/ops/monitor');
  assert('ops monitor passes', mon.body.ok === true, JSON.stringify(mon.body.checks?.filter((c) => !c.pass)));
  const rdy = await get('/api/ops/readiness');
  const ids = Object.fromEntries(rdy.body.items.map((i) => [i.id, i.status]));
  assert('readiness: brand merge done', ids.brand_merge === 'done');
  assert('readiness: tenancy/metering done', ids.multi_tenant_model === 'done' && ids.usage_metering === 'done');
  assert('readiness: storage pending without redis env', ids.durable_storage === 'pending');
  assert('readiness: rate limiting partial without redis env', ids.rate_limiting === 'partial');
  assert('readiness: contracts and packs exposed', ids.idp_contract === 'done' && ids.billing_policy === 'done' && ids.market_pack === 'done' && ids.dual_live_readback_plan === 'done');
  assert('readiness: scoped external gate recorded', ids.external_review_gate === 'done');
  assert('readiness: broad production gate honestly pending', ids.broad_production_review_gate === 'pending');

  const hard = await get('/api/ops/hardening');
  assert('hardening contract exposes local fallback', hard.body.rate_limit_mode.mode === 'local_token_bucket' && hard.body.controls.global_rate_limiting === 'local_token_bucket_fallback');
  const idp = await get('/api/ops/idp-contract');
  assert('idp contract not bound', idp.body.implementation_state === 'not_bound');
  const session = await get('/api/auth/session');
  assert('idp session fails closed when unbound', session.code === 401 && session.body.status === 'idp_not_bound');
  const billing = await get('/api/ops/billing-policy');
  assert('billing policy excludes payment capture', billing.body.payment_capture === false);
  const plan = await get('/api/dual/live-readback-plan');
  assert('dual live readback plan requires approval', plan.body.write_gate.required === true && plan.body.status === 'plan_ready_live_write_not_approved');
  const pack = await get('/api/product/market-pack');
  assert('market pack ready and caveated', pack.body.status === 'market_pack_ready' && pack.body.product === 'Revolv' && pack.body.caveats.length >= 3);
  const ident = await get('/api/product/public-identity');
  assert('public identity exposes canonical /revolv', ident.body.canonical_public_url.endsWith('/revolv') && ident.body.alias_public_state === 'protected_or_unverified');
  const prod = await get('/api/ops/production-readiness');
  assert('production readiness blocks broad claim', prod.body.production_ready_claim_allowed === false && prod.body.blockers.includes('broad_production_cowork_review'));
  assert('partner-ready pilot claim blocked before broad review', prod.body.partner_ready_claim_allowed === false && prod.body.claim_profiles.partner_ready_pilot.blockers.includes('broad_partner_ready_cowork_review'));
  const drill = await get('/api/ops/customer-session-drill');
  assert('customer session drill is explicit', drill.body.required_evidence.length >= 4);
  const runbook = await get('/api/ops/incident-runbook');
  assert('incident runbook exposes rollback', runbook.body.rollback.includes('Redeploy previous'));

  // DUAL sync lane fail-closed
  const prep = (await get('/api/dual/prepare/' + red1.body.receipt.id)).body;
  assert('dual payload preview, no write', prep.write_executed === false && prep.mapping_pending === true);
  const q = await post('/api/dual/queue', { receiptId: red1.body.receipt.id }, KEY);
  assert('verified receipt queued', q.body.status === 'queued');
  const execNoToken = await post('/api/dual/execute/' + q.body.queue_id, { execute_live_dual_write: true });
  assert('execute without operator token fails closed', execNoToken.code === 401 && execNoToken.body.status === 'operator_auth_required');

  // source bundle
  const bundle = (await get('/api/source/review-bundle')).body;
  assert('source review bundle hashes files', bundle.file_count > 15 && bundle.bundle_hash.startsWith('0x'));

  // rate limiting (last: exhausts write bucket)
  let limited = null;
  for (let i = 0; i < 90; i++) {
    const r = await post('/api/agent/eligibility', { offerId, mandateId: m, agentId: 'agent:rl' });
    if (r.code === 429) { limited = r; break; }
  }
  assert('rate limit triggers 429 with retry-after', limited && limited.body.error === 'rate_limited' && limited.body.retry_after_seconds >= 1);
} catch (err) {
  failures++;
  console.error('FAIL smoke crashed:', err.message);
} finally {
  child.kill();
}

if (failures > 0) { console.error(`\nsmoke FAILED (${failures})`); process.exit(1); }
console.log('\nsmoke PASSED');
