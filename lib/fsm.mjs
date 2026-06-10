// Revolv/OfferMesh lifecycle state machine — exact states/transitions per SAD 2026-06-10.
export const STATES = [
  'published', 'discovered', 'reserved', 'redeemed', 'settled', 'expired', 'clawed_back', 'flagged_review'
];

// transition map: event -> { from: [...], to }
export const TRANSITIONS = {
  discover:   { from: ['published'],               to: 'discovered' },
  reserve:    { from: ['published', 'discovered'], to: 'reserved' },
  redeem:     { from: ['reserved'],                to: 'redeemed' },
  settle:     { from: ['redeemed'],                to: 'settled' },
  expire:     { from: ['published', 'discovered', 'reserved'], to: 'expired' },
  claw_back:  { from: ['redeemed', 'flagged_review'], to: 'clawed_back' },
  flag:       { from: ['redeemed'],                to: 'flagged_review' }
};

export function canTransition(state, event) {
  const t = TRANSITIONS[event];
  return Boolean(t && t.from.includes(state));
}

export function transition(state, event) {
  const t = TRANSITIONS[event];
  if (!t) throw new FsmError(`unknown_event:${event}`);
  if (!t.from.includes(state)) throw new FsmError(`invalid_transition:${state}->${event}`);
  return t.to;
}

export class FsmError extends Error {
  constructor(code) { super(code); this.code = code; this.name = 'FsmError'; }
}
