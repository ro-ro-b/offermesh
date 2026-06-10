// Syntax + unit-level checks (no server). Exits non-zero on failure.
import { transition, canTransition, FsmError } from '../lib/fsm.mjs';
import { createStore } from '../lib/store.mjs';
import { seed } from '../data/seed.mjs';
import { checkEligibility, reserveOffer, redeemOffer } from '../lib/redemption.mjs';
import { verifyReceipt } from '../lib/verifier.mjs';
import { programReport } from '../lib/settlement.mjs';
import { escrowInvariantOk, pauseProgram, resumeProgram, topUpProgram, createOffer } from '../lib/offers.mjs';
import { runAgent } from '../lib/agentSim.mjs';
import { prepareDualPayload, queueDualSync, executeDualSync } from '../lib/dualSync.mjs';

let failures = 0;
function assert(name, cond) {
  if (cond) { console.log(`  ok  ${name}`); }
  else { failures++; console.error(`FAIL  ${name}`); }
}

console.log('FSM:');
assert('published -> discover -> discovered', transition('published', 'discover') === 'discovered');
assert('reserved -> redeem -> redeemed', transition('reserved', 'redeem') === 'redeemed');
assert('redeemed -> settle -> settled', transition('redeemed', 'settle') === 'settled');
assert('settled is terminal for redeem', !canTransition('settled', 'redeem'));
let threw = false;
try { transition('settled', 'reserve'); } catch (e) { threw = e instanceof FsmError; }
assert('invalid transition throws FsmError', threw);

console.log('Core loop (in-process):');
const store = createStore();
const { program, offers, goodMandate, narrowMandate, noSponsoredMandate } = seed(store);
const offer = offers[0];
const agentId = 'agent:claude-reference';

const eligBad = checkEligibility(store, { offerId: offer.id, mandateId: narrowMandate.id, agentId: 'agent:narrow-scope' });
assert('narrow mandate blocked', eligBad.eligible === false && eligBad.reasons.includes('scope_mismatch'));

const eligNoSpon = checkEligibility(store, { offerId: offer.id, mandateId: noSponsoredMandate.id, agentId: 'agent:unsponsored' });
assert('sponsored excluded by principal', eligNoSpon.eligible === false && eligNoSpon.reasons.includes('sponsored_offers_excluded_by_principal'));

const eligGood = checkEligibility(store, { offerId: offer.id, mandateId: goodMandate.id, agentId });
assert('good mandate eligible', eligGood.eligible === true);

reserveOffer(store, { offerId: offer.id, mandateId: goodMandate.id, agentId });
assert('offer reserved', store.offers.get(offer.id).state === 'reserved');
assert('escrow held', program.escrow_held === offer.incentive_value);

const { receipt } = redeemOffer(store, { offerId: offer.id, mandateId: goodMandate.id, agentId, idempotencyKey: 'check-1' });
assert('redeemed with receipt hash', receipt.receipt_hash.startsWith('0x'));

const again = redeemOffer(store, { offerId: offer.id, mandateId: goodMandate.id, agentId, idempotencyKey: 'check-1' });
assert('idempotent replay returns same receipt', again.idempotent_replay === true && again.receipt.id === receipt.id);

const v = verifyReceipt(store, receipt.id);
assert('verified and settled', v.verified === true && store.offers.get(offer.id).state === 'settled');
assert('escrow spent moved', program.escrow_spent === offer.incentive_value && escrowInvariantOk(program));

const store2 = createStore();
const s2 = seed(store2);
reserveOffer(store2, { offerId: s2.offers[0].id, mandateId: s2.goodMandate.id, agentId });
const r2 = redeemOffer(store2, { offerId: s2.offers[0].id, mandateId: s2.goodMandate.id, agentId, idempotencyKey: 'check-2' }).receipt;
const tampered = verifyReceipt(store2, r2.id, { ...r2, incentive_value: 99999 });
assert('tampered receipt flagged, no value', tampered.verified === false && tampered.value_released === false && store2.offers.get(s2.offers[0].id).state === 'flagged_review');

const report = programReport(store, program.id);
assert('report bills per verified outcome', report.billing_model === 'per_verified_outcome' && report.verified_outcomes === 1 && report.impressions_billed === 0);
assert('escrow invariant in report', report.escrow.invariant_ok === true);

console.log('Program controls:');
pauseProgram(store, program.id);
const eligPaused = checkEligibility(store, { offerId: offers[1].id, mandateId: goodMandate.id, agentId: 'agent:other' });
assert('paused program blocks eligibility', eligPaused.eligible === false && eligPaused.reasons.includes('program_paused'));
let mintBlocked = false;
try { createOffer(store, program.id, { title: 'x', price: 10, incentiveValue: 1 }); } catch (e) { mintBlocked = e.code === 'program_not_active'; }
assert('paused program blocks minting', mintBlocked);
resumeProgram(store, program.id);
const before = program.budget_escrow;
topUpProgram(store, program.id, 100);
assert('top-up extends budget + invariant', program.budget_escrow === before + 100 && escrowInvariantOk(program));

console.log('Agent simulator:');
const store3 = createStore();
const s3 = seed(store3);
const run = runAgent(store3, { mandateId: s3.goodMandate.id, agentId: 'agent:sim' });
assert('agent run completes with verification', run.outcome === 'completed' && run.verification.verified === true);
assert('agent trace has selection rationale', run.trace.some((t) => t.action === 'select' && t.rationale));
const runNoSpon = runAgent(store3, { mandateId: s3.noSponsoredMandate.id, agentId: 'agent:unsponsored' });
assert('unsponsored principal -> agent takes no action', runNoSpon.outcome === 'no_offers_within_principal_policy');

console.log('DUAL sync lane:');
const prep = prepareDualPayload(store3, run.receipt_id);
assert('payload preview never writes', prep.write_executed === false && prep.mapping_pending === true);
const q = queueDualSync(store3, run.receipt_id);
assert('verified receipt queues', q.status === 'queued');
const unverifiedQ = queueDualSync(store3, 'rcpt_nonexistent');
assert('unknown receipt blocked from queue', unverifiedQ.status === 'receipt_not_found');
delete process.env.OFFERMESH_OPERATOR_TOKEN;
const execNoToken = executeDualSync(store3, q.queue_id, { operatorTokenHeader: 'x', executeFlag: true });
assert('execute fails closed without operator token', execNoToken.status === 'operator_auth_required');
process.env.OFFERMESH_OPERATOR_TOKEN = 'check-operator-token';
const execBadToken = executeDualSync(store3, q.queue_id, { operatorTokenHeader: 'wrong-token-value!!', executeFlag: true });
assert('execute rejects bad token', execBadToken.status === 'operator_auth_required');
const execNoFlag = executeDualSync(store3, q.queue_id, { operatorTokenHeader: 'check-operator-token', executeFlag: false });
assert('execute requires explicit flag', execNoFlag.status === 'explicit_execute_flag_required');
const execAuthed = executeDualSync(store3, q.queue_id, { operatorTokenHeader: 'check-operator-token', executeFlag: true });
assert('fully authorized execute is truthfully mapping-pending, no write', execAuthed.status === 'blocked_mapping_pending' && execAuthed.write_executed === false);
delete process.env.OFFERMESH_OPERATOR_TOKEN;

console.log('Tenancy + metering + rate limit + production readiness (v0.5.1):');
{
  const { createTenant, resolveTenantByApiKey, resolveTenantByGatewayKey, rotateTenantKeys, setTenantStatus } = await import('../lib/tenants.mjs');
  const { meter, tenantUsage, billingRecord } = await import('../lib/metering.mjs');
  const { rateLimit, rateLimitMode } = await import('../lib/ratelimit.mjs');
  const { monitor, readiness, hardening } = await import('../lib/ops.mjs');
  const { billingPolicy, dualLiveReadbackPlan, idpAccessContract, marketPack } = await import('../lib/contracts.mjs');
  const { productionReadiness, publicIdentity, customerSessionDrill, incidentRunbook } = await import('../lib/production.mjs');
  const { oidcStatus, resolveOidcSession } = await import('../lib/idp.mjs');
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  const s = createStore();
  seed(s);
  const issued = createTenant(s, { name: 'Check Co' });
  assert('tenant keys issued once with prefixes', issued.api_key.startsWith('omk_') && issued.gateway_key.startsWith('omg_'));
  assert('raw keys not stored', !JSON.stringify([...s.tenants.values()]).includes(issued.api_key));
  assert('api key resolves tenant', resolveTenantByApiKey(s, issued.api_key)?.id === issued.tenant.id);
  assert('gateway key resolves tenant', resolveTenantByGatewayKey(s, issued.gateway_key)?.id === issued.tenant.id);
  assert('wrong key resolves nothing', resolveTenantByApiKey(s, 'omk_' + 'b'.repeat(48)) === null);
  setTenantStatus(s, issued.tenant.id, 'suspended');
  assert('suspended tenant flagged blocked', resolveTenantByApiKey(s, issued.api_key)?.blocked === true);
  setTenantStatus(s, issued.tenant.id, 'active');
  const rotated = rotateTenantKeys(s, issued.tenant.id);
  assert('rotation invalidates old key', resolveTenantByApiKey(s, issued.api_key) === null && resolveTenantByApiKey(s, rotated.api_key)?.id === issued.tenant.id);

  meter(s, issued.tenant.id, 'verified_outcomes');
  meter(s, issued.tenant.id, 'outcome_spend', 30);
  const u = tenantUsage(s, issued.tenant.id);
  assert('metering accumulates', u.months[0].verified_outcomes === 1 && u.months[0].outcome_spend === 30);
  const bill = billingRecord(s, issued.tenant.id, new Date().toISOString().slice(0, 7));
  assert('billing record hashed, no processor', bill.record_hash.startsWith('0x') && bill.payment_processor === 'none_excluded_this_phase');

  const fakeReq = { headers: { 'x-forwarded-for': 'check-client' }, socket: {} };
  let blocked = false;
  for (let i = 0; i < 100; i++) { if (!(await rateLimit(fakeReq, 'write')).allowed) { blocked = true; break; } }
  assert('rate limiter blocks after burst', blocked);
  assert('local rate-limit mode declared', rateLimitMode().mode === 'local_token_bucket' && rateLimitMode().global === false);

  const mon = monitor(s);
  assert('ops monitor green on healthy store', mon.ok === true, JSON.stringify(mon.checks.filter((c) => !c.pass)));
  const rdy = readiness(s);
  assert('readiness records scoped Cowork pass', rdy.items.find((i) => i.id === 'external_review_gate').status === 'done');
  assert('readiness keeps broad production gate pending', rdy.items.find((i) => i.id === 'broad_production_review_gate').status === 'pending');
  assert('hardening contract exposes fallback mode', hardening(s).rate_limit_mode.mode === 'local_token_bucket');
  assert('IdP contract is phase-2 only', idpAccessContract().implementation_state === 'not_bound');
  assert('OIDC status fails closed when unbound', oidcStatus().fail_closed === true && oidcStatus().implementation_state === 'not_bound');
  const noSession = await resolveOidcSession(s, { headers: {} });
  assert('OIDC session fails closed without config', noSession.ok === false && noSession.status === 'idp_not_bound');
  assert('billing policy excludes payment capture', billingPolicy().payment_capture === false);
  assert('DUAL readback plan requires explicit approval', dualLiveReadbackPlan().write_gate.required === true);
  assert('market pack is Revolv-branded', marketPack().product === 'Revolv');
  assert('public identity canonical URL is /revolv', publicIdentity().canonical_public_url.endsWith('/revolv'));
  const prod = productionReadiness(s, mon);
  assert('production readiness blocks broad claim', prod.production_ready_claim_allowed === false && prod.blockers.includes('broad_production_cowork_review'));
  assert('customer session drill requires isolation evidence', customerSessionDrill(s).required_evidence.length >= 4);
  assert('incident runbook lists fail-closed paths', incidentRunbook().fail_closed_paths.includes('OIDC when configured'));
}

if (failures > 0) { console.error(`\ncheck FAILED (${failures})`); process.exit(1); }
console.log('\ncheck PASSED');
