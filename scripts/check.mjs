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

if (failures > 0) { console.error(`\ncheck FAILED (${failures})`); process.exit(1); }
console.log('\ncheck PASSED');
