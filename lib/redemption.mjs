// Reserve/redeem core — auth-gated, idempotent, anti-replay, cap-enforced, escrow-accounted.
import { newId, sha256, logEvent } from './store.mjs';
import { transition } from './fsm.mjs';
import { evaluateMandate } from './mandates.mjs';
import { expireIfDue, holdEscrow, releaseHold, spendHold, OfferError } from './offers.mjs';

export function discoverOffer(store, offerId, agentId) {
  const offer = mustGetOffer(store, offerId);
  expireIfDue(store, offer);
  if (offer.state === 'published') {
    offer.state = transition(offer.state, 'discover');
    logEvent(store, 'offer-discovered', offer.id, offer.state, { agent_id_hash: sha256(agentId || 'anon') });
  }
  return offer;
}

export function checkEligibility(store, { offerId, mandateId, agentId }) {
  const offer = mustGetOffer(store, offerId);
  expireIfDue(store, offer);
  const reasons = [];
  if (!['published', 'discovered'].includes(offer.state)) reasons.push(`offer_${offer.state}`);
  const gate = evaluateMandate(store, mandateId, offer);
  reasons.push(...gate.reasons);
  const program = store.programs.get(offer.program_id);
  if (program.state !== 'active') reasons.push('program_paused');
  if (program.escrow_available < offer.incentive_value && offer.state !== 'reserved') reasons.push('budget_exhausted');
  const capKey = `${offer.program_id}:${agentId}`;
  if ((store.redemptionCounts.get(capKey) || 0) >= program.policy.per_agent_redemption_cap) reasons.push('per_agent_cap_reached');
  if ((store.epochRedemptions.get(offer.program_id) || 0) >= program.policy.per_epoch_redemption_cap) reasons.push('per_epoch_cap_reached');
  return { eligible: reasons.length === 0, reasons, sponsored: offer.sponsored, terms_hash: offer.terms_hash };
}

export function reserveOffer(store, { offerId, mandateId, agentId }) {
  const offer = mustGetOffer(store, offerId);
  expireIfDue(store, offer);
  const elig = checkEligibility(store, { offerId, mandateId, agentId });
  if (!elig.eligible) throw new RedemptionError('not_eligible', elig.reasons);
  holdEscrow(store, offer);
  offer.state = transition(offer.state, 'reserve');
  store.reservations.set(offer.id, { agentId, mandateId, at: new Date().toISOString() });
  logEvent(store, 'offer-reserved', offer.id, offer.state, { mandate_id: mandateId });
  return offer;
}

export function redeemOffer(store, { offerId, mandateId, agentId, idempotencyKey }) {
  if (!idempotencyKey) throw new RedemptionError('idempotency_key_required', []);
  // Idempotency: same key returns the same receipt, no double effect.
  if (store.idempotency.has(idempotencyKey)) {
    return { receipt: store.receipts.get(store.idempotency.get(idempotencyKey)), idempotent_replay: true };
  }
  const offer = mustGetOffer(store, offerId);
  if (offer.state !== 'reserved') throw new RedemptionError('offer_not_reserved', [`offer_${offer.state}`]);
  const reservation = store.reservations.get(offer.id);
  if (!reservation || reservation.agentId !== agentId || reservation.mandateId !== mandateId) {
    throw new RedemptionError('reservation_mismatch', []);
  }
  const gate = evaluateMandate(store, mandateId, offer);
  if (!gate.ok) { // mandate may have been revoked/expired between reserve and redeem
    releaseHold(store, offer);
    offer.state = 'discovered';
    store.reservations.delete(offer.id);
    throw new RedemptionError('mandate_gate_failed', gate.reasons);
  }
  offer.state = transition(offer.state, 'redeem');
  gate.mandate.spend_used += offer.price;
  const capKey = `${offer.program_id}:${agentId}`;
  store.redemptionCounts.set(capKey, (store.redemptionCounts.get(capKey) || 0) + 1);
  store.epochRedemptions.set(offer.program_id, (store.epochRedemptions.get(offer.program_id) || 0) + 1);

  const receipt = buildReceipt(store, offer, mandateId, agentId, idempotencyKey);
  // Anti-replay: receipt hash must be globally unique.
  if (store.receiptHashes.has(receipt.receipt_hash)) throw new RedemptionError('replay_detected', []);
  store.receiptHashes.add(receipt.receipt_hash);
  store.receipts.set(receipt.id, receipt);
  store.idempotency.set(idempotencyKey, receipt.id);
  logEvent(store, 'offer-redeemed', offer.id, offer.state, { receipt_hash: receipt.receipt_hash });
  return { receipt, idempotent_replay: false };
}

function buildReceipt(store, offer, mandateId, agentId, idempotencyKey) {
  const body = {
    offer_id: offer.id,
    program_id: offer.program_id,
    mandate_id: mandateId,
    agent_id_hash: sha256(agentId), // no agent identity in public state
    event_type: 'redemption',
    incentive_value: offer.incentive_value,
    terms_hash: offer.terms_hash,
    idempotency_key_hash: sha256(idempotencyKey),
    redeemed_at: new Date().toISOString()
  };
  return { id: newId('rcpt'), ...body, receipt_hash: sha256(body), verified: false, verified_at: null, status: 'pending_verification' };
}

export function mustGetOffer(store, offerId) {
  const offer = store.offers.get(offerId);
  if (!offer) throw new OfferError('offer_not_found');
  return offer;
}

export class RedemptionError extends Error {
  constructor(code, reasons) { super(code); this.code = code; this.reasons = reasons; this.name = 'RedemptionError'; }
}
