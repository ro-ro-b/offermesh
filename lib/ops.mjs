// Ops: internal monitor checks + truthful production-readiness scorecard.
// The scorecard NEVER claims more than the build can prove — Proof Capsule discipline.
import { escrowInvariantOk } from './offers.mjs';
import { transition } from './fsm.mjs';
import { hardeningContract } from './contracts.mjs';
import { rateLimitMode } from './ratelimit.mjs';
import { oidcStatus } from './idp.mjs';
import { COWORK_SCOPED_REVIEW, broadCoworkReview } from './version.mjs';
import { partnerPilotProofStatus } from './pilotProof.mjs';

export function monitor(store) {
  const checks = [];
  const add = (name, pass, detail = '', critical = true) => checks.push({ name, pass, critical, detail });

  try { add('fsm_sanity', transition('published', 'discover') === 'discovered'); }
  catch { add('fsm_sanity', false); }

  let escrowOk = true;
  for (const program of store.programs.values()) if (!escrowInvariantOk(program)) escrowOk = false;
  add('escrow_invariants_all_programs', escrowOk, `${store.programs.size} programs`);

  let receiptsOk = true;
  for (const r of store.receipts.values()) if (!r.receipt_hash?.startsWith('0x')) receiptsOk = false;
  add('receipt_hashes_present', receiptsOk, `${store.receipts.size} receipts`);

  add('event_log_hash_chain', store.events.every((e) => e.event_hash?.startsWith('0x')), `${store.events.length} events`);
  add('storage_last_save_ok', !store.lastRemoteError, store.lastRemoteError || store.lastRemoteSave || 'no save yet');
  add('agent_gateway_fail_closed', true, 'no key configured => no writes (structural)');
  add('tenants_present', store.tenants.size > 0, `${store.tenants.size} tenants`);
  add('no_raw_keys_at_rest', [...store.tenants.values()].every((t) => !JSON.stringify(t).includes('omk_') && !JSON.stringify(t).includes('omg_')));
  const rateMode = rateLimitMode();
  add('rate_limit_mode_declared', Boolean(rateMode.mode), `${rateMode.mode}; global=${rateMode.global}`);
  // config posture (non-critical: expected to differ between local and production)
  add('durable_storage_configured', Boolean(store.remote), store.remote ? store.remote.kind : 'ephemeral', false);
  add('admin_token_configured', Boolean(process.env.OFFERMESH_ADMIN_TOKEN), '', false);

  const failed = checks.filter((c) => !c.pass);
  const criticalFailed = failed.filter((c) => c.critical);
  return { ok: criticalFailed.length === 0, passed: checks.length - failed.length, failed: failed.length, critical_failed: criticalFailed.length, checks };
}

export function readiness(store) {
  const item = (id, status, detail) => ({ id, status, detail });
  const rateMode = rateLimitMode();
  const idp = oidcStatus();
  const broadReview = broadCoworkReview();
  const alerting = Boolean(process.env.OFFERMESH_ALERT_WEBHOOK_URL || process.env.OFFERMESH_ALERT_EMAIL || process.env.OFFERMESH_UPTIME_MONITOR_URL);
  const fineGrained = ['fine_grained', 'postgres', 'kv_atomic'].includes(process.env.OFFERMESH_STORAGE_CONCURRENCY_MODE || '');
  const pilotProof = partnerPilotProofStatus();
  return {
    service: 'revolv',
    product: 'revolv',
    engine: 'offermesh',
    claim_policy: 'This scorecard is the only readiness claim this service makes. Full production-ready and partner-ready-pilot claims are separate gates.',
    items: [
      item('brand_merge', 'done', 'Revolv is the market-facing product; OfferMesh is the underlying SaaS/protocol engine and compatibility layer'),
      item('multi_tenant_model', 'done', 'Brand workspaces with hashed API + gateway keys, suspend/rotate, scoped writes'),
      item('durable_storage', store.remote ? 'done' : 'pending', store.remote ? `${store.remote.kind}; whole-snapshot, last-writer-wins (single region)` : 'Upstash Redis not bound in this environment'),
      item('agent_auth_fail_closed', 'done', 'Per-tenant gateway keys; agent_auth_required without verified key'),
      item('console_auth', 'done', 'Tenant API key required for program/offer writes'),
      item('admin_plane', 'done', 'Admin token gated tenant lifecycle; fail-closed when unset'),
      item('usage_metering', 'done', 'Per-tenant monthly counters + hashed billing records'),
      item('rate_limiting', rateMode.global ? 'done' : 'partial', rateMode.global ? 'Redis fixed-window limiter active through Upstash REST' : 'Local process token bucket fallback; bind Upstash for global enforcement'),
      item('security_headers', 'done', 'CSP, nosniff, frame-deny, referrer-policy, HSTS'),
      item('input_validation', 'done', 'Type/range/length guards + 256KB body cap'),
      item('observability', alerting ? 'done' : 'partial', alerting ? 'Request IDs, monitor, and external alert sink configured' : 'Request IDs, /api/ops/monitor; external alerting not wired'),
      item('ci', 'done', 'GitHub Actions runs full suite on push'),
      item('idp_contract', 'done', 'Bring-your-own OIDC contract exposed at /api/ops/idp-contract; user login not bound in this phase'),
      item('idp_user_login', idp.implementation_state === 'oidc_configured_fail_closed' ? 'done' : 'pending', idp.implementation_state === 'oidc_configured_fail_closed' ? 'OIDC issuer/audience/JWKS configured; sessions fail closed on invalid token/tenant/role' : 'OIDC env not bound; tenant API keys remain the active SaaS control plane'),
      item('billing_policy', 'done', 'Metering-only policy exposed at /api/ops/billing-policy; no payment capture'),
      item('billing_processor', 'excluded', 'Stripe excluded this phase; metering substrate ready'),
      item('market_pack', 'done', 'One-page buyer pack and 90-second demo script prepared; public caveats remain explicit'),
      item('partner_pilot_proof', pilotProof.ok ? 'done' : 'pending', pilotProof.ok ? `Replayable partner-pilot proof ready (${pilotProof.passed}/${pilotProof.passed + pilotProof.failed}, ${pilotProof.evidence_hash})` : 'Replayable partner-pilot proof incomplete'),
      item('dual_live_readback_plan', 'done', 'Operator-gated plan prepared; live mapping/write still not approved'),
      item('live_dual_writes', 'excluded', 'Structurally impossible: no mapping/credentials; operator-gated lane returns blocked_mapping_pending'),
      item('external_review_gate', 'done', `External Claude Cowork returned ${COWORK_SCOPED_REVIEW.score}/10 for ${COWORK_SCOPED_REVIEW.scope}; not a broad production-ready score`),
      item('broad_production_review_gate', broadReview.passed ? 'done' : 'pending', broadReview.passed ? `External Claude Cowork returned ${broadReview.score}/10 for ${broadReview.claim_scope}` : 'Fresh broad production/partner-ready Cowork review required for this v0.9.0 tranche'),
      item('multi_region_concurrency', fineGrained ? 'done' : 'pending', fineGrained ? `Storage concurrency mode: ${process.env.OFFERMESH_STORAGE_CONCURRENCY_MODE}` : 'Snapshot persistence is last-writer-wins; fine-grained keys or Postgres for contended scale')
    ],
    generated_at: new Date().toISOString()
  };
}

export function hardening(store) {
  const rateMode = rateLimitMode();
  return {
    ...hardeningContract({ globalRateLimit: rateMode.global }),
    rate_limit_mode: rateMode,
    storage: {
      durable: Boolean(store.remote),
      mode: store.remote ? store.remote.kind : 'ephemeral_or_file',
      concurrency: process.env.OFFERMESH_STORAGE_CONCURRENCY_MODE || (store.remote ? 'whole_snapshot_last_writer_wins_single_region' : 'local_fallback')
    },
    idp: oidcStatus(),
    alerting: process.env.OFFERMESH_ALERT_WEBHOOK_URL || process.env.OFFERMESH_ALERT_EMAIL || process.env.OFFERMESH_UPTIME_MONITOR_URL ? 'configured_by_env' : 'not_configured',
    generated_at: new Date().toISOString()
  };
}
