// Agent Mandates pattern — principal-bound scoped authority; policy gate evaluated before any redemption action.
// allow_sponsored: the principal's lever over paid influence — enforceable because disclosure is machine-readable.
import { newId, sha256, logEvent } from './store.mjs';

export function createMandate(store, { principalRef, agentId, scope, spendCeiling, merchantAllowlist, expiresAt, allowSponsored }) {
  const mandate = {
    id: newId('mand'),
    principal_ref: principalRef,
    agent_id: agentId,
    scope: Array.isArray(scope) ? scope : [scope].filter(Boolean),
    spend_ceiling: spendCeiling,
    spend_used: 0,
    merchant_allowlist: merchantAllowlist || [],
    allow_sponsored: allowSponsored !== false, // default true; false = principal opts out of paid influence
    expires_at: expiresAt,
    state: 'active',
    created_at: new Date().toISOString()
  };
  mandate.policy_hash = sha256({
    scope: mandate.scope, spend_ceiling: mandate.spend_ceiling,
    merchant_allowlist: mandate.merchant_allowlist, allow_sponsored: mandate.allow_sponsored,
    expires_at: mandate.expires_at
  });
  store.mandates.set(mandate.id, mandate);
  logEvent(store, 'mandate-signed', mandate.id, mandate.state, { policy_hash: mandate.policy_hash });
  return mandate;
}

export function revokeMandate(store, mandateId) {
  const mandate = store.mandates.get(mandateId);
  if (!mandate) return null;
  mandate.state = 'revoked';
  logEvent(store, 'mandate-revoked', mandate.id, mandate.state);
  return mandate;
}

// The gate. Returns { ok, reasons[] } — never throws; callers decide.
export function evaluateMandate(store, mandateId, offer) {
  const reasons = [];
  const mandate = store.mandates.get(mandateId);
  if (!mandate) return { ok: false, reasons: ['mandate_not_found'] };
  if (mandate.state !== 'active') reasons.push(`mandate_${mandate.state}`);
  if (mandate.expires_at && new Date(mandate.expires_at) < new Date()) reasons.push('mandate_expired');
  if (!mandate.scope.includes(offer.eligibility_policy.required_scope)) reasons.push('scope_mismatch'); // scope must match action
  if (mandate.spend_used + offer.price > mandate.spend_ceiling) reasons.push('spend_ceiling_exceeded');
  if (mandate.merchant_allowlist.length > 0 && !mandate.merchant_allowlist.includes(offer.merchant)) reasons.push('merchant_not_allowed');
  if (offer.sponsored && !mandate.allow_sponsored) reasons.push('sponsored_offers_excluded_by_principal');
  return { ok: reasons.length === 0, reasons, mandate };
}
