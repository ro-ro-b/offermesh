import { oidcStatus } from './idp.mjs';
import { publicIdentity, productionReadiness, customerSessionDrill, incidentRunbook } from './production.mjs';
import { broadCoworkReview } from './version.mjs';

export function idpAccessContract() {
  const status = oidcStatus();
  return {
    status: status.implementation_state === 'oidc_configured_fail_closed' ? 'oidc_bound_fail_closed' : 'phase_2_contract_ready',
    provider: 'bring_your_own_oidc',
    implementation_state: status.implementation_state,
    product: 'revolv',
    engine: 'offermesh',
    guarantees: [
      'Tenant API keys remain the phase-1 control plane',
      'When OIDC env is configured, bearer tokens are verified against issuer/audience/JWKS before resolving a tenant',
      'IdP login must map every session to exactly one active tenant',
      'Admin actions require explicit admin role claim plus server-side authorization',
      'Agent gateway keys remain scoped to tenant workspaces',
      'No customer account is created by this demo'
    ],
    required_claims: ['sub', 'email', 'tenant_id', 'roles'],
    blocked_until_bound: status.implementation_state === 'oidc_configured_fail_closed' ? [] : ['browser_user_login', 'self_serve_invites', 'role_admin_ui'],
    runtime: status,
    next_step: status.implementation_state === 'oidc_configured_fail_closed' ? 'Run customer-session isolation drill and broad Cowork production review' : 'Bind Auth0/Clerk/WorkOS OIDC env values, then run customer-session isolation drill'
  };
}

export function billingPolicy() {
  return {
    status: 'metering_only_stripe_excluded',
    product: 'revolv',
    engine: 'offermesh',
    billing_model: 'cost_per_verified_redemption',
    payment_processor: 'none_excluded_this_phase',
    payment_capture: false,
    settlement: 'simulated_only_pending_legal_review',
    why: 'Keep proof of usage and billing records without triggering payment, tax, or promotional-law obligations before review.',
    production_pilot_path: 'Invoice-only or metering-only customer reporting is allowed before payment capture; Stripe/payment capture remains a separate legal and Cowork gate.',
    next_step: 'Choose invoice-only, Stripe sandbox, or platform rev-share after legal and Cowork review'
  };
}

export function dualLiveReadbackPlan() {
  return {
    status: 'plan_ready_live_write_not_approved',
    default_org: {
      name: 'Dual Labs',
      id: '6a1a927534603174374c8ecf'
    },
    recommended_first_binding: 'Revolv offer redemption proof template + one canonical demo program object',
    template_candidate: {
      slug: 'io.dual.revolv.offer_redemption_proof.v1',
      purpose: 'Anchor verified offer redemption receipts without exposing PII or raw agent IDs'
    },
    write_gate: {
      required: true,
      approval_text_needed: 'Create the Revolv DUAL template/object mapping in Dual Labs and perform one operator-gated readback rehearsal.',
      public_writes: false,
      operator_token_required: true
    },
    sequence: [
      'Create template skeleton from template/revolv-offer-token only after approval',
      'Create one canonical demo program object',
      'Update Vercel non-secret mapping env values',
      'Run read-only status/readback smoke',
      'Perform one operator-gated sync rehearsal only if explicitly approved',
      'Disable any temporary gate and record source-review bundle hash'
    ],
    blocked_now_by: ['no explicit live DUAL write approval for this action', 'no production template/object mapping', 'no legal approval for real settlement']
  };
}

export function marketPack() {
  const broadReview = broadCoworkReview();
  return {
    status: 'market_pack_ready',
    product: 'Revolv',
    tagline: 'The verified offer network for AI agents.',
    one_liner: 'Revolv turns brand offers into machine-readable SmartNFTs that agents can evaluate, claim, redeem, and prove, so brands pay for verified outcomes instead of impressions.',
    audience: ['agent platforms', 'commerce copilots', 'brand partnerships teams', 'marketplace operators'],
    proof_points: [
      'Every offer carries machine-readable sponsorship disclosure',
      'Agents act under scoped buyer mandates before reserving or redeeming',
      'Receipts are verified before spend is counted',
      'Replayable partner-pilot proof demonstrates two-tenant isolation and one complete offer-to-proof journey',
      'Metering is per verified redemption; impressions billed = 0',
      'DUAL posture is read-only until a live mapping is explicitly approved'
    ],
    demo_script_90s: [
      'Open with the problem: agents do not see ads; they evaluate structured offers.',
      'Show Revolv offers and the sponsored disclosure field.',
      'Run the autonomous agent and point to the decision trace.',
      'Show a principal that opts out of sponsored offers and watch the agent take no action.',
      'Show the verifier rejecting tampered receipts and preserving value.',
      'Close on the readiness screen: what is done, partial, pending, and excluded.'
    ],
    caveats: [
      broadReview.passed ? `External Claude Cowork returned ${broadReview.score}/10 for ${broadReview.claim_scope}` : 'Scoped external Claude Cowork review returned 9.8/10 for v0.4.0 next-six; broad production/partner-ready review is still pending',
      'No live DUAL writes in the current public demo',
      'No real payments, settlement, or fee share',
      'IdP login and global multi-region concurrency remain phase-2 work'
    ]
  };
}

export function hardeningContract({ globalRateLimit = false } = {}) {
  return {
    status: 'hardening_contract_ready',
    product: 'revolv',
    engine: 'offermesh',
    controls: {
      global_rate_limiting: globalRateLimit ? 'redis_fixed_window_active' : 'local_token_bucket_fallback',
      tenant_key_storage: 'sha256_hash_only',
      source_review_bundle: 'non_secret_files_only',
      security_headers: 'enabled',
      request_ids: 'enabled',
      monitor_endpoint: '/api/ops/monitor',
      readiness_endpoint: '/api/ops/readiness'
    },
    next_hardening: ['external alert sink', 'IdP role binding if env not configured', 'fine-grained datastore concurrency', 'fresh broad Cowork production review']
  };
}

export { publicIdentity, productionReadiness, customerSessionDrill, incidentRunbook };
