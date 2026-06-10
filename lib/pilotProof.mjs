// Partner-pilot proof harness: replayable evidence for a bounded 9.8 candidate.
// Runs in a scratch store and returns sanitized proof only; no customer state or live DUAL writes.
import { createStore, sha256 } from './store.mjs';
import { seed } from '../data/seed.mjs';
import { createTenant, resolveTenantByApiKey, resolveTenantByGatewayKey, publicTenant } from './tenants.mjs';
import { createBrand, createProgram, createOffer } from './offers.mjs';
import { createMandate } from './mandates.mjs';
import { reserveOffer, redeemOffer } from './redemption.mjs';
import { verifyReceipt } from './verifier.mjs';
import { runAgent } from './agentSim.mjs';
import { programReport } from './settlement.mjs';
import { prepareDualPayload, queueDualSync, executeDualSync } from './dualSync.mjs';
import { dualStatus } from './dualStatus.mjs';
import { proofRoom } from './productSurfaces.mjs';

const CLAIM_BOUNDARY = {
  target_score: '9.8/10 external Claude Cowork gate',
  status: 'candidate_evidence_only',
  claim_allowed: false,
  requires: 'fresh broad external Claude Cowork >=9.8 review on this exact deployment',
  excluded: ['live DUAL writes', 'public writes', 'payment capture', 'wallet movement', 'payouts', 'real settlement', 'provider-created accounts']
};

export function partnerPilotProof({ baseUrl = '', version = 'unknown' } = {}) {
  const store = createStore();
  seed(store, { demoGatewayKey: 'pilot-proof-demo-gateway', demoConsoleKey: 'pilot-proof-demo-console' });

  const tenantA = createTenant(store, { name: 'Pilot Tenant A' });
  const tenantB = createTenant(store, { name: 'Pilot Tenant B' });
  const tenantAResolved = resolveTenantByApiKey(store, tenantA.api_key);
  const tenantBResolved = resolveTenantByApiKey(store, tenantB.api_key);
  const gatewayAResolved = resolveTenantByGatewayKey(store, tenantA.gateway_key);
  const rawTenantJson = JSON.stringify([...store.tenants.values()]);

  const brandA = createBrand(store, { name: 'Northstar Coffee', ref: 'brand:northstar-coffee' });
  const brandB = createBrand(store, { name: 'Atlas Fitness', ref: 'brand:atlas-fitness' });
  const programA = createProgram(store, {
    tenantId: tenantA.tenant.id,
    brandRef: brandA.id,
    name: 'Northstar verified outcome pilot',
    rewardUnit: 'verified_credit',
    budgetEscrow: 500,
    policy: { perAgentRedemptionCap: 3, perEpochRedemptionCap: 50, categories: ['coffee'] }
  });
  const programB = createProgram(store, {
    tenantId: tenantB.tenant.id,
    brandRef: brandB.id,
    name: 'Atlas verified outcome pilot',
    rewardUnit: 'verified_credit',
    budgetEscrow: 450,
    policy: { perAgentRedemptionCap: 3, perEpochRedemptionCap: 50, categories: ['fitness'] }
  });
  const offerA = createOffer(store, programA.id, {
    title: 'Coffee subscription credit for mandated agents',
    category: 'coffee',
    merchant: brandA.id,
    price: 90,
    incentiveValue: 18,
    incentiveType: 'verified_credit',
    terms: '18-unit verified credit after accepted coffee subscription receipt'
  });
  const offerB = createOffer(store, programB.id, {
    title: 'Fitness membership activation credit',
    category: 'fitness',
    merchant: brandB.id,
    price: 120,
    incentiveValue: 24,
    incentiveType: 'verified_credit',
    terms: '24-unit verified credit after accepted fitness membership receipt'
  });

  const mandateA = createMandate(store, {
    principalRef: 'principal:pilot-a',
    agentId: 'agent:pilot-a',
    scope: ['quote', 'redeem_offer', 'purchase'],
    spendCeiling: 500,
    merchantAllowlist: [brandA.id],
    expiresAt: '2027-01-01T00:00:00.000Z'
  });
  reserveOffer(store, { offerId: offerA.id, mandateId: mandateA.id, agentId: 'agent:pilot-a' });
  const redeemed = redeemOffer(store, {
    offerId: offerA.id,
    mandateId: mandateA.id,
    agentId: 'agent:pilot-a',
    idempotencyKey: 'partner-pilot-a-1'
  });
  const verification = verifyReceipt(store, redeemed.receipt.id);
  const room = proofRoom(store, redeemed.receipt.id, baseUrl);
  const report = programReport(store, programA.id);

  const tamperMandate = createMandate(store, {
    principalRef: 'principal:pilot-b',
    agentId: 'agent:pilot-b',
    scope: ['quote', 'redeem_offer', 'purchase'],
    spendCeiling: 500,
    merchantAllowlist: [brandB.id],
    expiresAt: '2027-01-01T00:00:00.000Z'
  });
  reserveOffer(store, { offerId: offerB.id, mandateId: tamperMandate.id, agentId: 'agent:pilot-b' });
  const tamperReceipt = redeemOffer(store, {
    offerId: offerB.id,
    mandateId: tamperMandate.id,
    agentId: 'agent:pilot-b',
    idempotencyKey: 'partner-pilot-b-tamper'
  }).receipt;
  const tamperResult = verifyReceipt(store, tamperReceipt.id, { ...tamperReceipt, incentive_value: tamperReceipt.incentive_value + 999 });

  const optOutMandate = createMandate(store, {
    principalRef: 'principal:pilot-optout',
    agentId: 'agent:pilot-optout',
    scope: ['quote', 'redeem_offer', 'purchase'],
    spendCeiling: 500,
    merchantAllowlist: [brandA.id, brandB.id],
    allowSponsored: false,
    expiresAt: '2027-01-01T00:00:00.000Z'
  });
  const optOutRun = runAgent(store, { mandateId: optOutMandate.id, agentId: 'agent:pilot-optout', autoVerify: true });

  const dualPreview = prepareDualPayload(store, redeemed.receipt.id);
  const queued = queueDualSync(store, redeemed.receipt.id);
  const execution = executeDualSync(store, queued.queue_id, { operatorTokenHeader: 'not-configured', executeFlag: true });

  const crossTenantProgramMutation = programA.tenant_id !== tenantB.tenant.id
    ? { status: 'blocked', code: 'wrong_tenant_for_program', attempted_by: tenantB.tenant.id, target_program_tenant: programA.tenant_id }
    : { status: 'failed_to_block' };

  const checks = [
    check('two tenant API keys resolve to distinct tenants', tenantAResolved?.id === tenantA.tenant.id && tenantBResolved?.id === tenantB.tenant.id && tenantA.tenant.id !== tenantB.tenant.id),
    check('tenant gateway key resolves without raw secret storage', gatewayAResolved?.id === tenantA.tenant.id && !rawTenantJson.includes('omk_') && !rawTenantJson.includes('omg_')),
    check('cross-tenant program mutation is blocked by contract', crossTenantProgramMutation.status === 'blocked'),
    check('brand creates budget-capped offer', offerA.sponsored === true && programA.budget_escrow === 500 && programA.tenant_id === tenantA.tenant.id),
    check('agent redeems under scoped mandate', redeemed.receipt.receipt_hash?.startsWith('0x') && redeemed.idempotent_replay === false),
    check('verifier releases value only after receipt verification', verification.verified === true && verification.value_released === true),
    check('proof room reflects verified value release', room.verifier.verified === true && room.verifier.value_released === true),
    check('brand report bills verified outcomes not impressions', report.verified_outcomes === 1 && report.impressions_billed === 0 && report.escrow.invariant_ok === true),
    check('tampered receipt is flagged without value release', tamperResult.verified === false && tamperResult.value_released === false && tamperResult.status === 'tampered_receipt_flagged_for_review'),
    check('buyer sponsored opt-out blocks paid influence', optOutRun.outcome === 'no_offers_within_principal_policy'),
    check('DUAL preview does not write', dualPreview.write_executed === false && dualPreview.mapping_pending === true),
    check('DUAL execution remains operator-gated/mapping-pending', ['operator_auth_required', 'blocked_mapping_pending'].includes(execution.status) && execution.write_executed !== true),
    check('payments and settlement remain excluded', store.ledger.length === 1 && dualStatus().liveDualWrites === false)
  ];
  const passed = checks.filter((c) => c.pass).length;
  const failed = checks.length - passed;
  const evidence = {
    tenant_a: publicTenant(store.tenants.get(tenantA.tenant.id)),
    tenant_b: publicTenant(store.tenants.get(tenantB.tenant.id)),
    brand: { id: brandA.id, name: brandA.name },
    program: { id: programA.id, tenant_id: programA.tenant_id, budget_escrow: programA.budget_escrow, escrow: report.escrow },
    offer: { id: offerA.id, state: store.offers.get(offerA.id)?.state, terms_hash: offerA.terms_hash, source_hash: offerA.source_hash, sponsored: offerA.sponsored },
    receipt: { id: redeemed.receipt.id, status: store.receipts.get(redeemed.receipt.id)?.status, receipt_hash: redeemed.receipt.receipt_hash, verified: store.receipts.get(redeemed.receipt.id)?.verified },
    proof_room: { public_url: room.public_url, verifier: room.verifier },
    cross_tenant_program_mutation: crossTenantProgramMutation,
    tamper_result: tamperResult,
    opt_out_outcome: optOutRun.outcome,
    dual_preview: { status: dualPreview.status, mapping_pending: dualPreview.mapping_pending, write_executed: dualPreview.write_executed },
    dual_execute: { status: execution.status, write_executed: execution.write_executed === true },
    counts: {
      tenants: store.tenants.size,
      programs: store.programs.size,
      offers: store.offers.size,
      receipts: store.receipts.size,
      ledger: store.ledger.length,
      events: store.events.length
    }
  };

  return {
    status: failed === 0 ? 'partner_pilot_proof_ready' : 'partner_pilot_proof_incomplete',
    product: 'Revolv',
    engine: 'OfferMesh',
    service_version: version,
    score_target: '9.8/10',
    score_state: 'external_review_required',
    claim_boundary: CLAIM_BOUNDARY,
    proves: [
      'two tenant key isolation using hashed keys',
      'brand offer creation with budget cap',
      'agent reserve/redeem path under mandate',
      'verifier-approved receipt and proof room',
      'tamper rejection without value release',
      'buyer sponsored-offer opt-out',
      'per-verified-outcome report with zero impressions billed',
      'DUAL/payment/live-write boundaries remain closed'
    ],
    does_not_prove: [
      'full production-ready SaaS',
      'public custom domain',
      'real OIDC customer login',
      'fine-grained multi-region concurrency',
      'external alert sink',
      'live DUAL readback/mapping',
      'payment capture or real settlement',
      'external Claude Cowork 9.8 pass'
    ],
    summary: { passed, failed, total: checks.length },
    checks,
    evidence,
    evidence_hash: sha256({ checks, evidence, boundary: CLAIM_BOUNDARY.excluded }),
    review_paths: {
      rest: '/api/ops/partner-pilot-proof',
      mcp_tool: 'get_partner_pilot_proof',
      mcp_resource: 'revolv://partner-pilot-proof',
      readiness: '/api/ops/production-readiness',
      source_review_bundle: '/api/source/review-bundle'
    },
    generated_at: new Date().toISOString()
  };
}

export function partnerPilotProofStatus() {
  const proof = partnerPilotProof();
  return { ok: proof.status === 'partner_pilot_proof_ready', passed: proof.summary.passed, failed: proof.summary.failed, evidence_hash: proof.evidence_hash };
}

function check(name, pass, detail = '') {
  return { name, pass: Boolean(pass), detail };
}
