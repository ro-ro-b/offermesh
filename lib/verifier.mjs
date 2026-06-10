// Independent outcome verifier — recomputes receipt hashes; tampered/fake receipts move to review, never to value.
import { sha256, logEvent } from './store.mjs';
import { transition } from './fsm.mjs';
import { spendHold, releaseHold } from './offers.mjs';

export function verifyReceipt(store, receiptId, submittedReceipt = null) {
  // Public verification path: verify a stored receipt, or red-team check a submitted receipt body.
  const stored = store.receipts.get(receiptId);
  if (!stored) {
    return { verified: false, status: 'receipt_not_found', value_released: false };
  }
  if (submittedReceipt) {
    // Red-team path: a submitted receipt must match the stored hash exactly.
    const recomputed = recomputeHash(submittedReceipt);
    if (recomputed !== stored.receipt_hash) {
      flagOffer(store, stored);
      return { verified: false, status: 'tampered_receipt_flagged_for_review', value_released: false };
    }
  }
  const recomputed = recomputeHash(stored);
  if (recomputed !== stored.receipt_hash) {
    flagOffer(store, stored);
    return { verified: false, status: 'hash_mismatch_flagged_for_review', value_released: false };
  }
  if (stored.verified) {
    return { verified: true, status: 'already_verified', value_released: false, receipt_hash: stored.receipt_hash };
  }
  stored.verified = true;
  stored.verified_at = new Date().toISOString();
  stored.status = 'verified';
  const offer = store.offers.get(stored.offer_id);
  if (offer && offer.state === 'redeemed') {
    spendHold(store, offer);
    offer.state = transition(offer.state, 'settle');
    logEvent(store, 'action-settled', offer.id, offer.state, { receipt_hash: stored.receipt_hash });
    store.ledger.push({
      offer_id: offer.id,
      program_id: offer.program_id,
      outcome_fee: offer.incentive_value,
      receipt_hash: stored.receipt_hash,
      verified_at: stored.verified_at
    });
  }
  return { verified: true, status: 'verified_and_settled', value_released: true, receipt_hash: stored.receipt_hash };
}

export function disputeReceipt(store, receiptId) {
  const stored = store.receipts.get(receiptId);
  if (!stored) return { status: 'receipt_not_found' };
  const offer = store.offers.get(stored.offer_id);
  if (offer && ['redeemed', 'flagged_review'].includes(offer.state)) {
    if (offer.state === 'redeemed') offer.state = transition(offer.state, 'flag');
    offer.state = transition(offer.state, 'claw_back');
    releaseHold(store, offer);
    stored.status = 'disputed_clawed_back';
    logEvent(store, 'offer-clawed-back', offer.id, offer.state, { receipt_hash: stored.receipt_hash });
    return { status: 'clawed_back', offer_state: offer.state };
  }
  return { status: 'not_disputable', offer_state: offer?.state };
}

function flagOffer(store, receipt) {
  const offer = store.offers.get(receipt.offer_id);
  if (offer && offer.state === 'redeemed') {
    offer.state = transition(offer.state, 'flag');
    logEvent(store, 'exception-flagged', offer.id, offer.state, { receipt_hash: receipt.receipt_hash });
  }
  receipt.status = 'flagged_review';
}

function recomputeHash(receipt) {
  const body = {
    offer_id: receipt.offer_id,
    program_id: receipt.program_id,
    mandate_id: receipt.mandate_id,
    agent_id_hash: receipt.agent_id_hash,
    event_type: receipt.event_type,
    incentive_value: receipt.incentive_value,
    terms_hash: receipt.terms_hash,
    idempotency_key_hash: receipt.idempotency_key_hash,
    redeemed_at: receipt.redeemed_at
  };
  return sha256(body);
}
