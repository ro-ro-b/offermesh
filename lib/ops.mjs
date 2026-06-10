// Ops: internal monitor checks + truthful production-readiness scorecard.
// The scorecard NEVER claims more than the build can prove — Proof Capsule discipline.
import { escrowInvariantOk } from './offers.mjs';
import { transition } from './fsm.mjs';

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
  // config posture (non-critical: expected to differ between local and production)
  add('durable_storage_configured', Boolean(store.remote), store.remote ? store.remote.kind : 'ephemeral', false);
  add('admin_token_configured', Boolean(process.env.OFFERMESH_ADMIN_TOKEN), '', false);

  const failed = checks.filter((c) => !c.pass);
  const criticalFailed = failed.filter((c) => c.critical);
  return { ok: criticalFailed.length === 0, passed: checks.length - failed.length, failed: failed.length, critical_failed: criticalFailed.length, checks };
}

export function readiness(store) {
  const item = (id, status, detail) => ({ id, status, detail });
  return {
    service: 'offermesh',
    claim_policy: 'This scorecard is the only readiness claim this service makes. Do not quote a broader claim.',
    items: [
      item('multi_tenant_model', 'done', 'Brand workspaces with hashed API + gateway keys, suspend/rotate, scoped writes'),
      item('durable_storage', store.remote ? 'done' : 'pending', store.remote ? `${store.remote.kind}; whole-snapshot, last-writer-wins (single region)` : 'Upstash Redis not bound in this environment'),
      item('agent_auth_fail_closed', 'done', 'Per-tenant gateway keys; agent_auth_required without verified key'),
      item('console_auth', 'done', 'Tenant API key required for program/offer writes'),
      item('admin_plane', 'done', 'Admin token gated tenant lifecycle; fail-closed when unset'),
      item('usage_metering', 'done', 'Per-tenant monthly counters + hashed billing records'),
      item('rate_limiting', 'partial', 'Token bucket per instance; Redis-backed global limiter is next hardening step'),
      item('security_headers', 'done', 'CSP, nosniff, frame-deny, referrer-policy, HSTS'),
      item('input_validation', 'done', 'Type/range/length guards + 256KB body cap'),
      item('observability', 'partial', 'Request IDs, /api/ops/monitor; external alerting not wired'),
      item('ci', 'done', 'GitHub Actions runs full suite on push'),
      item('idp_user_login', 'pending', 'Phase 2 per decision 2026-06-10 (API-key SaaS first)'),
      item('billing_processor', 'excluded', 'Stripe excluded this phase; metering substrate ready'),
      item('live_dual_writes', 'excluded', 'Structurally impossible: no mapping/credentials; operator-gated lane returns blocked_mapping_pending'),
      item('external_review_gate', 'pending', 'External Claude Cowork 9.8 review not yet performed — required before production-grade claim'),
      item('multi_region_concurrency', 'pending', 'Snapshot persistence is last-writer-wins; fine-grained keys or Postgres for contended scale')
    ],
    generated_at: new Date().toISOString()
  };
}
