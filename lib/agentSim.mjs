// Autonomous agent simulator — the thesis demo. The agent never "sees an ad": it scores structured,
// disclosed offers against its principal's mandate policy and acts only inside that authority.
import { publicOffer } from './offers.mjs';
import { checkEligibility, reserveOffer, redeemOffer, discoverOffer } from './redemption.mjs';
import { verifyReceipt } from './verifier.mjs';
import { newId } from './store.mjs';

export function runAgent(store, { mandateId, agentId, autoVerify = true }) {
  const trace = [];
  const step = (action, detail) => trace.push({ step: trace.length + 1, action, ...detail });
  const mandate = store.mandates.get(mandateId);
  if (!mandate) return { outcome: 'mandate_not_found', trace };

  step('load_mandate', {
    policy_hash: mandate.policy_hash,
    scope: mandate.scope,
    spend_remaining: mandate.spend_ceiling - mandate.spend_used,
    allow_sponsored: mandate.allow_sponsored
  });

  // 1. Discovery: structured offers, not adverts.
  const candidates = [...store.offers.values()].filter((o) => ['published', 'discovered'].includes(o.state));
  step('discover', { candidates_found: candidates.length, note: 'All candidates carry machine-readable sponsored=true disclosure.' });

  // 2. Principal policy filter: sponsored exclusion is enforceable because disclosure is structured.
  const afterPolicy = candidates.filter((o) => mandate.allow_sponsored || !o.sponsored);
  if (afterPolicy.length === 0) {
    step('principal_policy_filter', { remaining: 0, reason: 'sponsored_offers_excluded_by_principal' });
    return { outcome: 'no_offers_within_principal_policy', trace,
      note: 'Principal opted out of paid influence; agent took no sponsored action. This is the disclosure guarantee working.' };
  }
  step('principal_policy_filter', { remaining: afterPolicy.length });

  // 3. Evaluate + score: value density (incentive per unit price), eligibility-gated.
  const evaluated = afterPolicy.map((o) => {
    const elig = checkEligibility(store, { offerId: o.id, mandateId, agentId });
    return { offer: o, eligible: elig.eligible, reasons: elig.reasons, score: o.incentive_value / o.price };
  });
  step('evaluate', {
    evaluations: evaluated.map((e) => ({ offer_id: e.offer.id, title: e.offer.title, eligible: e.eligible, score: Number(e.score.toFixed(4)), blocked_reasons: e.reasons }))
  });

  const eligible = evaluated.filter((e) => e.eligible).sort((a, b) => b.score - a.score);
  if (eligible.length === 0) {
    step('select', { selected: null, reason: 'no_eligible_offers' });
    return { outcome: 'no_eligible_offers', trace };
  }
  const best = eligible[0];
  step('select', { selected: best.offer.id, title: best.offer.title, score: Number(best.score.toFixed(4)), rationale: 'highest verified incentive density within mandate' });

  // 4. Act: discover -> reserve -> redeem (server-side simulation runs inside the auth boundary).
  discoverOffer(store, best.offer.id, agentId);
  reserveOffer(store, { offerId: best.offer.id, mandateId, agentId });
  step('reserve', { offer_id: best.offer.id, state: store.offers.get(best.offer.id).state, escrow: 'incentive value held' });

  const { receipt } = redeemOffer(store, { offerId: best.offer.id, mandateId, agentId, idempotencyKey: newId('sim') });
  step('redeem', { receipt_id: receipt.id, receipt_hash: receipt.receipt_hash, status: receipt.status });

  // 5. Verification: outcome becomes billable only when independently verified.
  let verification = null;
  if (autoVerify) {
    verification = verifyReceipt(store, receipt.id);
    step('verify', { verified: verification.verified, status: verification.status, value_released: verification.value_released });
  }

  return {
    outcome: 'completed',
    selected_offer: publicOffer(store.offers.get(best.offer.id)),
    receipt_id: receipt.id,
    verification,
    trace,
    thesis: 'No impression was shown or billed. The brand pays only for this verified outcome.'
  };
}
