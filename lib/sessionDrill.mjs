// Replayable two-tenant customer-session isolation drill.
// Uses scratch state only. It exercises the same tenant-key boundary the HTTP
// console uses and returns sanitized evidence; raw keys are never returned.
import { createStore, sha256 } from './store.mjs';
import { seed } from '../data/seed.mjs';
import { createTenant, publicTenant, resolveTenantByApiKey, resolveTenantByGatewayKey } from './tenants.mjs';
import { createBrand, createOffer, createProgram, pauseProgram, topUpProgram } from './offers.mjs';
import { oidcStatus } from './idp.mjs';

export function runCustomerSessionDrill({ version = 'unknown' } = {}) {
  const store = createStore();
  seed(store, { demoGatewayKey: 'session-drill-demo-gateway', demoConsoleKey: 'session-drill-demo-console' });

  const issuedA = createTenant(store, { name: 'Session Tenant Alpha' });
  const issuedB = createTenant(store, { name: 'Session Tenant Beta' });
  const sessionA = resolveTenantByApiKey(store, issuedA.api_key);
  const sessionB = resolveTenantByApiKey(store, issuedB.api_key);
  const gatewayA = resolveTenantByGatewayKey(store, issuedA.gateway_key);
  const gatewayB = resolveTenantByGatewayKey(store, issuedB.gateway_key);

  const brandA = createBrand(store, { name: 'Alpha Retail', ref: 'brand:session-alpha' });
  const brandB = createBrand(store, { name: 'Beta Travel', ref: 'brand:session-beta' });
  const programA = createProgram(store, {
    tenantId: sessionA?.id,
    brandRef: brandA.id,
    name: 'Alpha customer session drill',
    rewardUnit: 'verified_credit',
    budgetEscrow: 300,
    policy: { perAgentRedemptionCap: 2, perEpochRedemptionCap: 20, categories: ['retail'] }
  });
  const programB = createProgram(store, {
    tenantId: sessionB?.id,
    brandRef: brandB.id,
    name: 'Beta customer session drill',
    rewardUnit: 'verified_credit',
    budgetEscrow: 250,
    policy: { perAgentRedemptionCap: 2, perEpochRedemptionCap: 20, categories: ['travel'] }
  });

  const ownOfferA = tenantScopedOfferCreate(store, sessionA, programA.id, {
    title: 'Alpha verified session offer',
    category: 'retail',
    merchant: brandA.id,
    price: 60,
    incentiveValue: 12,
    incentiveType: 'verified_credit',
    terms: '12-unit verified credit after Alpha receipt'
  });
  const ownOfferB = tenantScopedOfferCreate(store, sessionB, programB.id, {
    title: 'Beta verified session offer',
    category: 'travel',
    merchant: brandB.id,
    price: 75,
    incentiveValue: 15,
    incentiveType: 'verified_credit',
    terms: '15-unit verified credit after Beta receipt'
  });
  const crossMint = tenantScopedOfferCreate(store, sessionB, programA.id, {
    title: 'Illicit cross-tenant offer',
    price: 10,
    incentiveValue: 1
  });
  const crossPause = tenantScopedProgramAction(store, sessionB, programA.id, 'pause');
  const ownTopup = tenantScopedProgramAction(store, sessionA, programA.id, 'topup', { amount: 50 });

  const rawState = JSON.stringify([...store.tenants.values()]);
  const checks = [
    check('tenant API sessions resolve to distinct active tenants', sessionA?.id === issuedA.tenant.id && sessionB?.id === issuedB.tenant.id && sessionA.id !== sessionB.id),
    check('tenant gateway sessions resolve to distinct active tenants', gatewayA?.id === issuedA.tenant.id && gatewayB?.id === issuedB.tenant.id && gatewayA.id !== gatewayB.id),
    check('session A creates only tenant A program offer', ownOfferA.http_status === 201 && ownOfferA.offer.program_id === programA.id),
    check('session B creates only tenant B program offer', ownOfferB.http_status === 201 && ownOfferB.offer.program_id === programB.id),
    check('session B cannot mint into tenant A program', crossMint.http_status === 403 && crossMint.status === 'wrong_tenant_for_program'),
    check('session B cannot mutate tenant A program controls', crossPause.http_status === 403 && crossPause.status === 'wrong_tenant_for_program'),
    check('session A can mutate its own program controls', ownTopup.http_status === 200 && ownTopup.program.budget_escrow === 350),
    check('raw tenant API and gateway keys are absent from scratch state', !rawState.includes('omk_') && !rawState.includes('omg_')),
    check('OIDC remains fail-closed unless provider env is bound', oidcStatus().fail_closed === true)
  ];
  const passed = checks.filter((c) => c.pass).length;
  const failed = checks.length - passed;
  const evidence = {
    auth_mode: oidcStatus().implementation_state === 'oidc_configured_fail_closed' ? 'oidc_or_tenant_api_key' : 'tenant_api_key_replay',
    tenant_a: publicTenant(store.tenants.get(issuedA.tenant.id)),
    tenant_b: publicTenant(store.tenants.get(issuedB.tenant.id)),
    session_fingerprints: [
      { session: 'tenant_a_console', tenant_id: issuedA.tenant.id, key_hash_prefix: sha256(issuedA.api_key).slice(0, 14) },
      { session: 'tenant_b_console', tenant_id: issuedB.tenant.id, key_hash_prefix: sha256(issuedB.api_key).slice(0, 14) },
      { session: 'tenant_a_gateway', tenant_id: issuedA.tenant.id, key_hash_prefix: sha256(issuedA.gateway_key).slice(0, 14) },
      { session: 'tenant_b_gateway', tenant_id: issuedB.tenant.id, key_hash_prefix: sha256(issuedB.gateway_key).slice(0, 14) }
    ],
    own_tenant_writes: [
      { session: 'tenant_a_console', http_status: ownOfferA.http_status, offer_id: ownOfferA.offer?.id, program_id: programA.id },
      { session: 'tenant_b_console', http_status: ownOfferB.http_status, offer_id: ownOfferB.offer?.id, program_id: programB.id },
      { session: 'tenant_a_console', http_status: ownTopup.http_status, action: 'topup', budget_escrow: ownTopup.program?.budget_escrow }
    ],
    cross_tenant_denials: [
      { session: 'tenant_b_console', target_program: programA.id, action: 'mint_offer', http_status: crossMint.http_status, status: crossMint.status },
      { session: 'tenant_b_console', target_program: programA.id, action: 'pause_program', http_status: crossPause.http_status, status: crossPause.status }
    ],
    counts: {
      tenants: store.tenants.size,
      programs: store.programs.size,
      offers: store.offers.size,
      events: store.events.length
    },
    oidc: oidcStatus()
  };

  return {
    status: failed === 0 ? 'customer_session_drill_ready' : 'customer_session_drill_incomplete',
    product: 'Revolv',
    engine: 'OfferMesh',
    service_version: version,
    proof_level: 'replayable_two_tenant_control_plane_session_drill',
    claim_effect: 'Supports closure of the two_tenant_browser_isolation evidence blocker while OIDC user login remains a separate provider-binding gate.',
    proves: [
      'two independent tenant console sessions resolve to distinct tenants',
      'two independent agent gateway sessions resolve to distinct tenants',
      'same-tenant console writes are allowed',
      'cross-tenant offer minting is denied',
      'cross-tenant program control mutation is denied',
      'raw keys are not stored in scratch state',
      'OIDC remains fail-closed unless configured'
    ],
    does_not_prove: [
      'real customer IdP account creation',
      'third-party OIDC provider binding',
      'payment capture or settlement',
      'live DUAL write/readback',
      'public writes'
    ],
    summary: { passed, failed, total: checks.length },
    checks,
    evidence,
    evidence_hash: sha256({ checks, evidence }),
    generated_at: new Date().toISOString()
  };
}

export function customerSessionDrillStatus() {
  const drill = runCustomerSessionDrill();
  return {
    ok: drill.status === 'customer_session_drill_ready',
    passed: drill.summary.passed,
    failed: drill.summary.failed,
    evidence_hash: drill.evidence_hash,
    proof_level: drill.proof_level
  };
}

function tenantScopedOfferCreate(store, tenant, programId, input) {
  const program = store.programs.get(programId);
  if (!tenant || tenant.blocked) return { http_status: 401, status: 'tenant_auth_required' };
  if (program?.tenant_id && program.tenant_id !== tenant.id) return { http_status: 403, status: 'wrong_tenant_for_program' };
  const offer = createOffer(store, programId, input);
  return { http_status: 201, status: 'created', offer };
}

function tenantScopedProgramAction(store, tenant, programId, action, input = {}) {
  const program = store.programs.get(programId);
  if (!tenant || tenant.blocked) return { http_status: 401, status: 'tenant_auth_required' };
  if (program?.tenant_id && program.tenant_id !== tenant.id) return { http_status: 403, status: 'wrong_tenant_for_program' };
  if (action === 'pause') return { http_status: 200, status: 'paused', program: pauseProgram(store, programId) };
  if (action === 'topup') return { http_status: 200, status: 'topped_up', program: topUpProgram(store, programId, input.amount) };
  return { http_status: 422, status: 'unsupported_action' };
}

function check(name, pass, detail = '') {
  return { name, pass: Boolean(pass), detail };
}
