import { dualStatus } from './dualStatus.mjs';
import { oidcStatus } from './idp.mjs';
import { publicUrls, COWORK_SCOPED_REVIEW, VERSION, broadCoworkReview } from './version.mjs';
import { partnerPilotProofStatus } from './pilotProof.mjs';
import { customerSessionDrillStatus, runCustomerSessionDrill } from './sessionDrill.mjs';
import { storageConcurrencyStatus } from './storage.mjs';

export function publicIdentity() {
  const urls = publicUrls();
  return {
    product: 'revolv',
    engine: 'offermesh',
    canonical_public_url: urls.canonical,
    compatibility_root_url: urls.compatibility_root,
    protected_alias_url: urls.protected_alias,
    alias_public_state: process.env.REVOLV_ALIAS_PUBLIC === '1' ? 'public' : 'protected_or_unverified',
    repo: 'https://github.com/ro-ro-b/offermesh',
    route_contract: {
      public_demo_route: '/revolv',
      api_status: '/api/status',
      mcp: '/mcp',
      readiness: '/api/ops/readiness',
      production_readiness: '/api/ops/production-readiness'
    },
    note: 'Public identity is production-pilot usable through the canonical URL. The Revolv alias must not be described as public until protection is intentionally changed or a custom domain is attached.'
  };
}

export function productionReadiness(store, monitorResult) {
  const idp = oidcStatus();
  const dual = dualStatus();
  const broadReview = broadCoworkReview();
  const durable = Boolean(store.remote);
  const concurrency = storageConcurrencyStatus(store);
  const alerting = Boolean(process.env.OFFERMESH_ALERT_WEBHOOK_URL || process.env.OFFERMESH_ALERT_EMAIL || process.env.OFFERMESH_UPTIME_MONITOR_URL);
  const aliasPublic = process.env.REVOLV_ALIAS_PUBLIC === '1';
  const pilotProof = partnerPilotProofStatus();
  const sessionDrill = customerSessionDrillStatus();
  const item = (id, status, detail) => ({ id, status, detail });
  const items = [
    item('scoped_cowork_review', 'done', `External Cowork returned ${COWORK_SCOPED_REVIEW.score}/10 for ${COWORK_SCOPED_REVIEW.scope}`),
    item('broad_production_cowork_review', broadReview.passed ? 'done' : 'pending', broadReview.passed ? `External Cowork returned ${broadReview.score}/10 for ${broadReview.scope}` : 'Fresh broad production/partner-ready Cowork review must run against this exact v0.10.0 commit/deployment'),
    item('canonical_public_url', 'done', publicIdentity().canonical_public_url),
    item('revolv_alias_or_custom_domain', aliasPublic ? 'done' : 'pending', aliasPublic ? 'Alias marked public by config' : 'revolv-offers.vercel.app remains protected/unverified; custom domain or protection change still needed'),
    item('tenant_key_control_plane', 'done', 'Hashed tenant API/gateway keys, rotate/suspend/resume, fail-closed writes'),
    item('oidc_user_login', idp.implementation_state === 'oidc_configured_fail_closed' ? 'done' : 'pending', idp.implementation_state === 'oidc_configured_fail_closed' ? 'OIDC env configured; bearer tokens verified against JWKS and tenant claims' : 'OIDC env not bound; tenant API keys remain the production control plane'),
    item('two_tenant_browser_isolation', sessionDrill.ok ? 'done' : 'pending', sessionDrill.ok ? `Replayable two-tenant session drill ready (${sessionDrill.passed}/${sessionDrill.passed + sessionDrill.failed}, ${sessionDrill.evidence_hash})` : 'Needs two real browser sessions or replayable session drill evidence after IdP/public URL decision'),
    item('durable_storage', durable ? 'done' : 'pending', durable ? `${store.remote.kind}; ${concurrency.mode}` : 'No hosted durable storage adapter bound'),
    item('partner_pilot_proof', pilotProof.ok ? 'done' : 'pending', pilotProof.ok ? `Replayable partner-pilot proof ready (${pilotProof.passed}/${pilotProof.passed + pilotProof.failed}, ${pilotProof.evidence_hash})` : 'Replayable partner-pilot proof incomplete'),
    item('fine_grained_concurrency', concurrency.protected ? 'done' : 'pending', concurrency.protected ? concurrency.detail : 'Current persistence is snapshot-level; use Postgres or Redis optimistic locking before contended multi-tenant scale'),
    item('observability_alerting', alerting ? 'done' : 'partial', alerting ? 'External alert sink configured by env' : 'Request IDs and monitor exist; external alert sink not configured'),
    item('dual_readback_mapping', dual.readbackReady ? 'done' : 'pending', dual.readbackReady ? 'DUAL readback mapping configured' : 'DUAL mapping/readback remains plan-only; no live write approval recorded'),
    item('payment_capture', 'excluded', 'No payment capture or settlement; metering/invoice evidence only'),
    item('monitor_green', monitorResult?.ok ? 'done' : 'pending', monitorResult?.ok ? `${monitorResult.passed}/${monitorResult.passed + monitorResult.failed} checks passed` : 'Monitor not green')
  ];
  const productionBlockers = items.filter((i) => ['pending', 'partial'].includes(i.status)).map((i) => i.id);
  const partnerItems = [
    item('broad_partner_ready_cowork_review', broadReview.passed ? 'done' : 'pending', broadReview.passed ? `External Cowork returned ${broadReview.score}/10 for ${broadReview.claim_scope}` : 'Fresh broad Cowork review required before partner-ready language'),
    item('canonical_public_url', 'done', publicIdentity().canonical_public_url),
    item('tenant_key_control_plane', 'done', 'Tenant API/gateway keys, rotate/suspend/resume, fail-closed writes'),
    item('durable_storage', durable ? 'done' : 'pending', durable ? `${store.remote.kind}; snapshot persistence disclosed` : 'Hosted durable storage required for partner-ready pilot claim'),
    item('partner_pilot_proof', pilotProof.ok ? 'done' : 'pending', pilotProof.ok ? `Replayable partner-pilot proof ready (${pilotProof.passed}/${pilotProof.passed + pilotProof.failed}, ${pilotProof.evidence_hash})` : 'Replayable partner-pilot proof incomplete'),
    item('agent_and_console_auth_fail_closed', 'done', 'Agent, tenant console, and admin writes require verified credentials'),
    item('monitor_green', monitorResult?.ok ? 'done' : 'pending', monitorResult?.ok ? `${monitorResult.passed}/${monitorResult.passed + monitorResult.failed} checks passed` : 'Monitor not green'),
    item('bounded_exclusions_disclosed', 'done', 'No live DUAL writes, no payment capture, no wallet movement, no public writes, OIDC optional/BYO until configured'),
    item('source_review_bundle', 'done', 'Non-secret source-review bundle available at /api/source/review-bundle')
  ];
  const partnerBlockers = partnerItems.filter((i) => ['pending', 'partial'].includes(i.status)).map((i) => i.id);
  return {
    product: 'revolv',
    engine: 'offermesh',
    state: productionBlockers.length === 0 ? 'production_ready_candidate' : partnerBlockers.length === 0 ? 'partner_ready_pilot' : 'production_pilot_incomplete',
    production_ready_claim_allowed: productionBlockers.length === 0,
    partner_ready_claim_allowed: partnerBlockers.length === 0,
    partner_ready_claim: partnerBlockers.length === 0
      ? 'Partner-ready for scoped production pilots: public demo, tenant-key control plane, MCP/REST proof loop, metering records, source-review bundle, monitor/readiness/runbook, and explicit exclusions for live DUAL writes, payment capture, wallet movement, public writes, and provider-created accounts.'
      : null,
    scoped_review: COWORK_SCOPED_REVIEW,
    broad_review: broadReview,
    public_identity: publicIdentity(),
    items,
    blockers: productionBlockers,
    claim_profiles: {
      production_ready: {
        claim_allowed: productionBlockers.length === 0,
        blockers: productionBlockers,
        items
      },
      partner_ready_pilot: {
        claim_allowed: partnerBlockers.length === 0,
        blockers: partnerBlockers,
        items: partnerItems
      }
    },
    generated_at: new Date().toISOString()
  };
}

export function customerSessionDrill(store) {
  const drill = runCustomerSessionDrill({ version: VERSION });
  return {
    ...drill,
    current_tenants: [...store.tenants.values()].map((t) => ({ id: t.id, slug: t.slug, status: t.status })),
    required_evidence: [
      'Tenant A browser session can read/write only Tenant A programs/offers',
      'Tenant B browser session can read/write only Tenant B programs/offers',
      'Cross-tenant program mutation returns 403',
      'Agent gateway keys remain tenant-scoped',
      'No raw keys appear in logs, state, browser output, or source-review bundle'
    ],
    gate: 'Replayable tenant-session evidence is captured here. Real OIDC provider login remains a separate production gate until env is bound and externally reviewed.'
  };
}

export function incidentRunbook() {
  return {
    status: 'runbook_ready_alert_sink_pending',
    monitors: ['/api/ops/monitor', '/api/ops/readiness', '/api/ops/production-readiness', '/api/status'],
    fail_closed_paths: ['agent auth', 'tenant console auth', 'admin plane', 'OIDC when configured', 'DUAL execute lane'],
    rollback: 'Redeploy previous Vercel production deployment or revert main to last passing commit; public writes and live DUAL writes remain disabled by design.',
    alerting: process.env.OFFERMESH_ALERT_WEBHOOK_URL || process.env.OFFERMESH_ALERT_EMAIL || process.env.OFFERMESH_UPTIME_MONITOR_URL ? 'configured_by_env' : 'not_configured',
    on_call_notes: [
      'If monitor fails storage_last_save_ok, stop customer onboarding and inspect Upstash/Vercel env.',
      'If auth checks fail open, rollback immediately.',
      'If DUAL posture ever reports publicWrites=true unexpectedly, rollback and quarantine.'
    ]
  };
}
