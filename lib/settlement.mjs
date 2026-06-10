// Settlement reporting — per verified outcome, the replacement for per-impression billing.
// Reward epoch is SIMULATED (read-only); financial rewards require legal review before any payout.
import { sha256 } from './store.mjs';
import { escrowInvariantOk } from './offers.mjs';

export function programReport(store, programId) {
  const program = store.programs.get(programId);
  if (!program) return null;
  const offers = [...store.offers.values()].filter((o) => o.program_id === programId);
  const byState = {};
  for (const o of offers) byState[o.state] = (byState[o.state] || 0) + 1;
  const entries = store.ledger.filter((e) => e.program_id === programId);
  return {
    program_id: programId,
    name: program.name,
    sponsored: program.sponsored,
    billing_model: 'per_verified_outcome',
    impressions_billed: 0, // the point
    offers_total: offers.length,
    offers_by_state: byState,
    verified_outcomes: entries.length,
    outcome_spend: entries.reduce((s, e) => s + e.outcome_fee, 0),
    escrow: {
      budget: program.budget_escrow,
      available: program.escrow_available,
      held: program.escrow_held,
      spent: program.escrow_spent,
      invariant_ok: escrowInvariantOk(program)
    }
  };
}

export function simulateRewardEpoch(store, programId) {
  const entries = store.ledger.filter((e) => e.program_id === programId);
  const epoch = {
    id: `epoch_${programId.slice(-8)}`,
    simulated: true,
    financial_reward: false,
    legal_review_required_before_financial_rewards: true,
    allocation_basis: ['verified_proof_receipts', 'guardrail_passed'],
    verified_receipts: entries.length,
    simulated_allocation_units: entries.reduce((s, e) => s + e.outcome_fee, 0),
    closed_at: new Date().toISOString()
  };
  epoch.epoch_hash = sha256(epoch);
  return epoch;
}
