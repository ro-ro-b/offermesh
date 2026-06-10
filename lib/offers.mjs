// Brands, offer programs, and offer tokens — escrowed budget accounting, pause/top-up, machine-readable sponsorship disclosure.
import { newId, sha256, logEvent } from './store.mjs';
import { transition } from './fsm.mjs';

export function createBrand(store, { name, ref }) {
  if (!name) throw new OfferError('brand_name_required');
  const brand = { id: ref || `brand:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name, created_at: new Date().toISOString() };
  if (store.brands.has(brand.id)) return store.brands.get(brand.id);
  store.brands.set(brand.id, brand);
  logEvent(store, 'brand-registered', brand.id, 'active');
  return brand;
}

export function createProgram(store, { brandRef, name, rewardUnit, budgetEscrow, policy }) {
  if (!brandRef || !name) throw new OfferError('program_fields_required');
  if (!store.brands.has(brandRef)) throw new OfferError('brand_not_found');
  if (!Number.isFinite(budgetEscrow) || budgetEscrow <= 0) throw new OfferError('budget_escrow_invalid');
  const program = {
    id: newId('prog'),
    brand_ref: brandRef,
    name,
    reward_unit: rewardUnit || 'loyalty_credit',
    // Escrow accounting invariant: escrow_available + escrow_held + escrow_spent === budget_escrow
    budget_escrow: budgetEscrow,
    escrow_available: budgetEscrow,
    escrow_held: 0,
    escrow_spent: 0,
    policy: {
      per_agent_redemption_cap: policy?.perAgentRedemptionCap ?? 1,
      per_epoch_redemption_cap: policy?.perEpochRedemptionCap ?? 100,
      categories: policy?.categories ?? []
    },
    sponsored: true, // disclosure-native: always true, always public
    state: 'active',
    created_at: new Date().toISOString()
  };
  program.policy_hash = sha256(program.policy);
  store.programs.set(program.id, program);
  logEvent(store, 'program-created', program.id, program.state, { policy_hash: program.policy_hash });
  return program;
}

export function pauseProgram(store, programId) {
  const program = mustGetProgram(store, programId);
  program.state = 'paused';
  logEvent(store, 'program-paused', program.id, program.state);
  return program;
}

export function resumeProgram(store, programId) {
  const program = mustGetProgram(store, programId);
  program.state = 'active';
  logEvent(store, 'program-resumed', program.id, program.state);
  return program;
}

export function topUpProgram(store, programId, amount) {
  const program = mustGetProgram(store, programId);
  if (!Number.isFinite(amount) || amount <= 0) throw new OfferError('topup_amount_invalid');
  program.budget_escrow += amount;
  program.escrow_available += amount;
  logEvent(store, 'program-topped-up', program.id, program.state, { amount });
  return program;
}

export function createOffer(store, programId, { title, category, merchant, price, incentiveValue, incentiveType, expiresAt, terms }) {
  const program = mustGetProgram(store, programId);
  if (program.state !== 'active') throw new OfferError('program_not_active');
  if (!Number.isFinite(incentiveValue) || incentiveValue <= 0) throw new OfferError('incentive_value_invalid');
  if (!Number.isFinite(price) || price <= 0) throw new OfferError('price_invalid');
  const offer = {
    id: newId('offer'),
    program_id: programId,
    issuer_ref: program.brand_ref,              // immutable
    title, category: category || 'general',
    merchant: merchant || program.brand_ref,
    price,
    incentive_value: incentiveValue,
    incentive_type: incentiveType || 'discount',
    sponsored: true,                            // disclosure in public state
    eligibility_policy: {
      min_spend_ceiling: price,
      merchant: merchant || program.brand_ref,
      required_scope: 'redeem_offer'
    },
    terms: terms || `${incentiveType || 'discount'} of ${incentiveValue} on qualifying purchase`,
    state: 'published',
    expires_at: expiresAt || null,
    created_at: new Date().toISOString()
  };
  offer.source_hash = sha256({ id: offer.id, issuer_ref: offer.issuer_ref, terms: offer.terms });
  offer.terms_hash = sha256(offer.terms);
  store.offers.set(offer.id, offer);
  logEvent(store, 'offer-published', offer.id, offer.state, { terms_hash: offer.terms_hash });
  return offer;
}

export function expireIfDue(store, offer) {
  if (offer.expires_at && new Date(offer.expires_at) < new Date()
      && ['published', 'discovered', 'reserved'].includes(offer.state)) {
    if (offer.state === 'reserved') releaseHold(store, offer);
    offer.state = transition(offer.state, 'expire');
    logEvent(store, 'offer-expired', offer.id, offer.state);
  }
  return offer;
}

export function holdEscrow(store, offer) {
  const program = mustGetProgram(store, offer.program_id);
  if (program.escrow_available < offer.incentive_value) throw new OfferError('budget_exhausted');
  program.escrow_available -= offer.incentive_value;
  program.escrow_held += offer.incentive_value;
}

export function releaseHold(store, offer) {
  const program = mustGetProgram(store, offer.program_id);
  program.escrow_held -= offer.incentive_value;
  program.escrow_available += offer.incentive_value;
}

export function spendHold(store, offer) {
  const program = mustGetProgram(store, offer.program_id);
  program.escrow_held -= offer.incentive_value;
  program.escrow_spent += offer.incentive_value;
}

export function escrowInvariantOk(program) {
  return (program.escrow_available + program.escrow_held + program.escrow_spent) === program.budget_escrow;
}

export function publicOffer(offer) {
  const { ...pub } = offer;
  return pub;
}

export function mustGetProgram(store, programId) {
  const program = store.programs.get(programId);
  if (!program) throw new OfferError('program_not_found');
  return program;
}

export class OfferError extends Error {
  constructor(code) { super(code); this.code = code; this.name = 'OfferError'; }
}
