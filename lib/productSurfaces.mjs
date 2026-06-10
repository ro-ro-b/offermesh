import { createBrand, createProgram, createOffer, publicOffer } from './offers.mjs';
import { createMandate } from './mandates.mjs';
import { reserveOffer, redeemOffer } from './redemption.mjs';
import { verifyReceipt } from './verifier.mjs';
import { runAgent } from './agentSim.mjs';
import { programReport, simulateRewardEpoch } from './settlement.mjs';
import { dualStatus } from './dualStatus.mjs';
import { newId } from './store.mjs';

const CLAIM_BOUNDARY = {
  production_ready_claim_allowed: false,
  partner_ready_claim_requires: 'fresh broad external Claude Cowork >=9.8 review on this exact deployment',
  excluded: ['live DUAL writes', 'public writes', 'payment capture', 'wallet movement', 'payouts', 'real settlement', 'provider-created accounts']
};

export function createOfferFlow(store, tenantId, input = {}, baseUrl = '') {
  const brandName = clean(input.brandName, 'Partner Brand', 80);
  const brandRef = clean(input.brandRef, slugRef(brandName), 80);
  const offerTitle = clean(input.offerTitle, 'Verified agent offer', 160);
  const category = clean(input.category, 'general', 40);
  const price = bounded(input.price, 100, 0.01, 1e9);
  const incentiveValue = bounded(input.incentiveValue, 10, 0.01, 1e9);
  const budgetEscrow = bounded(input.budgetEscrow, incentiveValue * 10, incentiveValue, 1e9);
  const incentiveType = clean(input.incentiveType, 'discount', 40);
  const terms = clean(input.terms, `${incentiveValue} ${incentiveType} on verified agent redemption`, 500);

  const brand = createBrand(store, { name: brandName, ref: brandRef });
  const program = createProgram(store, {
    tenantId,
    brandRef: brand.id,
    name: clean(input.programName, `${brandName} verified-outcome pilot`, 120),
    rewardUnit: clean(input.rewardUnit, 'loyalty_credit', 40),
    budgetEscrow,
    policy: {
      perAgentRedemptionCap: bounded(input.perAgentRedemptionCap, 1, 1, 1000),
      perEpochRedemptionCap: bounded(input.perEpochRedemptionCap, 100, 1, 100000),
      categories: [category]
    }
  });
  const offer = createOffer(store, program.id, {
    title: offerTitle,
    category,
    merchant: brand.id,
    price,
    incentiveValue,
    incentiveType,
    expiresAt: input.expiresAt || null,
    terms
  });

  return {
    status: 'offer_ready_for_agent_discovery',
    product: 'Revolv',
    engine: 'OfferMesh',
    brand,
    program,
    offer: publicOffer(offer),
    proof_room: proofRoomSummary(baseUrl, offer.id),
    agent_preview: agentOfferPreview(offer, program, brand),
    next_actions: [
      'Open proof room',
      'Preview in agent marketplace',
      'Run partner demo mode',
      'Review brand dashboard after verified outcomes'
    ],
    claim_boundary: CLAIM_BOUNDARY
  };
}

export function runPartnerDemo(store, tenantId, input = {}, baseUrl = '') {
  const suffix = newId('demo').slice(-6);
  const brandName = clean(input.brandName, `Partner Demo ${suffix}`, 80);
  const brandRef = clean(input.brandRef, `brand:partner-demo-${suffix}`, 80);
  const brand = createBrand(store, { name: brandName, ref: brandRef });
  const program = createProgram(store, {
    tenantId,
    brandRef: brand.id,
    name: `${brandName} proof-backed offer loop`,
    rewardUnit: 'verified_credit',
    budgetEscrow: 600,
    policy: { perAgentRedemptionCap: 3, perEpochRedemptionCap: 50, categories: ['demo'] }
  });
  const offer = createOffer(store, program.id, {
    title: clean(input.offerTitle, 'Partner demo offer for mandated agents', 160),
    category: 'demo',
    merchant: brand.id,
    price: 100,
    incentiveValue: 80,
    incentiveType: 'verified_credit',
    terms: '80-unit verified credit released only after verifier-approved receipt'
  });
  const goodMandate = createMandate(store, {
    principalRef: 'principal:partner-demo',
    agentId: 'agent:reference-demo',
    scope: ['quote', 'redeem_offer', 'purchase'],
    spendCeiling: 500,
    merchantAllowlist: [brand.id],
    expiresAt: '2027-01-01T00:00:00.000Z'
  });
  const acceptedRun = runAgent(store, { mandateId: goodMandate.id, agentId: 'agent:reference-demo', autoVerify: true });

  const optOutMandate = createMandate(store, {
    principalRef: 'principal:privacy-first-demo',
    agentId: 'agent:reference-optout',
    scope: ['quote', 'redeem_offer', 'purchase'],
    spendCeiling: 500,
    merchantAllowlist: [brand.id],
    allowSponsored: false,
    expiresAt: '2027-01-01T00:00:00.000Z'
  });
  const optOutRun = runAgent(store, { mandateId: optOutMandate.id, agentId: 'agent:reference-optout', autoVerify: true });

  const tamperOffer = createOffer(store, program.id, {
    title: 'Tamper-check offer',
    category: 'demo',
    merchant: brand.id,
    price: 120,
    incentiveValue: 24,
    incentiveType: 'verified_credit',
    terms: 'Tamper-check receipt should be rejected if altered'
  });
  const tamperMandate = createMandate(store, {
    principalRef: 'principal:red-team-demo',
    agentId: 'agent:reference-redteam',
    scope: ['redeem_offer', 'purchase'],
    spendCeiling: 500,
    merchantAllowlist: [brand.id],
    expiresAt: '2027-01-01T00:00:00.000Z'
  });
  reserveOffer(store, { offerId: tamperOffer.id, mandateId: tamperMandate.id, agentId: 'agent:reference-redteam' });
  const tamperReceipt = redeemOffer(store, {
    offerId: tamperOffer.id,
    mandateId: tamperMandate.id,
    agentId: 'agent:reference-redteam',
    idempotencyKey: `tamper-${suffix}`
  }).receipt;
  const tamperResult = verifyReceipt(store, tamperReceipt.id, { ...tamperReceipt, incentive_value: tamperReceipt.incentive_value + 999 });

  return {
    status: 'partner_demo_completed',
    product: 'Revolv',
    brand,
    program,
    hero_offer: publicOffer(offer),
    proof_room: proofRoomSummary(baseUrl, offer.id),
    steps: [
      { label: 'Brand published', status: 'done', evidence: { program_id: program.id, offer_id: offer.id, sponsored: true } },
      { label: 'Agent evaluated and redeemed', status: acceptedRun.outcome, evidence: acceptedRun },
      { label: 'Buyer opt-out blocked paid influence', status: optOutRun.outcome, evidence: optOutRun },
      { label: 'Verifier rejected tampered receipt', status: tamperResult.status, evidence: tamperResult },
      { label: 'Brand report updated', status: 'ready', evidence: programReport(store, program.id) }
    ],
    claim_boundary: CLAIM_BOUNDARY
  };
}

export function proofRoom(store, id, baseUrl = '') {
  const match = locateProofSubject(store, id);
  if (!match) return { status: 'not_found', id };
  const { offer, program, receipt } = match;
  const brand = store.brands.get(program?.brand_ref);
  const receipts = [...store.receipts.values()].filter((r) => r.offer_id === offer?.id || r.program_id === program?.id);
  const latestReceipt = receipt || receipts.at(-1) || null;
  return {
    status: 'proof_room_ready',
    product: 'Revolv',
    engine: 'OfferMesh',
    public_url: proofRoomSummary(baseUrl, offer?.id || program?.id || id).url,
    subject: match.type,
    brand,
    program,
    offer: offer ? publicOffer(offer) : null,
    receipts,
    latest_receipt: latestReceipt,
    verifier: latestReceipt ? verifierSummary(latestReceipt) : { status: 'no_receipt_yet', verified: false, value_released: false },
    report: program ? programReport(store, program.id) : null,
    reward_epoch: program ? simulateRewardEpoch(store, program.id) : null,
    disclosure: {
      sponsored: offer?.sponsored ?? program?.sponsored ?? true,
      machine_readable: true,
      terms_hash: offer?.terms_hash || null,
      source_hash: offer?.source_hash || null
    },
    dual: dualStatus(),
    claim_boundary: CLAIM_BOUNDARY
  };
}

export function brandDashboard(store, filter = {}) {
  const brandRef = filter.brandRef || null;
  const programs = [...store.programs.values()].filter((p) => !brandRef || p.brand_ref === brandRef);
  const offers = [...store.offers.values()].filter((o) => programs.some((p) => p.id === o.program_id));
  const receipts = [...store.receipts.values()].filter((r) => offers.some((o) => o.id === r.offer_id));
  const reports = programs.map((p) => programReport(store, p.id)).filter(Boolean);
  const outcomeSpend = reports.reduce((s, r) => s + r.outcome_spend, 0);
  const verifiedOutcomes = reports.reduce((s, r) => s + r.verified_outcomes, 0);
  const rejectedReceipts = receipts.filter((r) => ['flagged_review', 'disputed_clawed_back'].includes(r.status)).length;
  return {
    status: 'brand_dashboard_ready',
    billing_model: 'per_verified_outcome',
    impressions_billed: 0,
    totals: {
      programs: programs.length,
      active_programs: programs.filter((p) => p.state === 'active').length,
      offers: offers.length,
      published_or_discoverable_offers: offers.filter((o) => ['published', 'discovered'].includes(o.state)).length,
      receipts: receipts.length,
      verified_outcomes: verifiedOutcomes,
      rejected_or_disputed_receipts: rejectedReceipts,
      outcome_spend: outcomeSpend
    },
    programs: reports,
    proof_rooms: offers.slice(-8).map((o) => proofRoomSummary('', o.id)),
    claim_boundary: CLAIM_BOUNDARY
  };
}

export function agentMarketplace(store, filter = {}) {
  const offers = [...store.offers.values()]
    .filter((o) => ['published', 'discovered'].includes(o.state))
    .filter((o) => !filter.category || o.category === filter.category)
    .map((offer) => {
      const program = store.programs.get(offer.program_id);
      const brand = store.brands.get(program?.brand_ref);
      return {
        ...publicOffer(offer),
        brand_name: brand?.name || offer.issuer_ref,
        program_name: program?.name || offer.program_id,
        agent_visible_fields: ['title', 'price', 'incentive_value', 'sponsored', 'eligibility_policy', 'terms_hash', 'source_hash'],
        mcp_tools: ['discover_offers', 'get_offer', 'check_eligibility', 'reserve_offer', 'redeem_offer', 'verify_receipt']
      };
    });
  return {
    status: 'agent_marketplace_ready',
    product: 'Revolv',
    sponsored_disclosure: 'all listed offers carry sponsored=true in machine-readable state',
    count: offers.length,
    offers,
    principal_controls: ['allowSponsored=false opt-out', 'merchant allowlist', 'spend ceiling', 'required redeem_offer scope'],
    claim_boundary: CLAIM_BOUNDARY
  };
}

export function referenceAgentGuide() {
  return {
    status: 'reference_agent_ready',
    product: 'Revolv',
    agent_role: 'Evaluate structured offers against buyer mandate; never show covert ads.',
    loop: ['discover_offers', 'check_eligibility', 'reserve_offer', 'redeem_offer', 'verify_receipt', 'get_program_report'],
    scoring: 'highest verified incentive density within mandate after sponsored-disclosure and policy checks',
    required_auth: {
      read_tools: 'public',
      reserve_redeem_simulate_queue: 'verified x-offermesh-gateway-key',
      live_dual_execution: 'operator-gated and mapping-pending; not available in this build'
    },
    sample_mcp_call: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'discover_offers', arguments: { category: 'audio' } }
    },
    fail_closed_paths: ['missing gateway key', 'mandate scope mismatch', 'sponsored opt-out', 'budget exhausted', 'tampered receipt'],
    claim_boundary: CLAIM_BOUNDARY
  };
}

export function partnerHardeningPlan({ readiness, productionReadiness, hardening, idp, publicIdentity, monitor }) {
  return {
    status: 'partner_hardening_plan_ready',
    product: 'Revolv',
    current_state: productionReadiness.state,
    partner_ready_claim_allowed: productionReadiness.partner_ready_claim_allowed,
    production_ready_claim_allowed: productionReadiness.production_ready_claim_allowed,
    lanes: [
      { id: 'guided_offer_creation', status: 'done', evidence: 'single Create Offer flow creates brand, program, offer, preview, and proof-room link' },
      { id: 'partner_demo_mode', status: 'done', evidence: 'one run proves publish -> agent -> opt-out -> tamper -> report' },
      { id: 'shareable_proof_room', status: 'done', evidence: '/proof/:id and /api/product/proof-room/:id' },
      { id: 'brand_dashboard', status: 'done', evidence: '/api/product/brand-dashboard' },
      { id: 'agent_marketplace', status: 'done', evidence: '/api/product/agent-marketplace and MCP tool' },
      { id: 'reference_agent', status: 'done', evidence: '/api/product/reference-agent and MCP tool' },
      { id: 'custom_domain_alias', status: publicIdentity.alias_public_state === 'public' ? 'done' : 'pending', evidence: publicIdentity.alias_public_state },
      { id: 'oidc_user_login', status: idp.implementation_state === 'bound' ? 'done' : 'pending', evidence: idp.implementation_state },
      { id: 'two_tenant_browser_isolation', status: 'pending', evidence: 'requires real two-browser/customer-session drill' },
      { id: 'fine_grained_concurrency', status: productionReadiness.blockers.includes('fine_grained_concurrency') ? 'pending' : 'done', evidence: hardening.rate_limit_mode },
      { id: 'observability_alerting', status: productionReadiness.blockers.includes('observability_alerting') ? 'partial' : 'done', evidence: monitor.ok ? 'monitor green' : 'monitor failing' },
      { id: 'dual_readback_mapping', status: 'pending', evidence: 'requires explicit live DUAL mapping approval' },
      { id: 'broad_cowork_review', status: productionReadiness.blockers.includes('broad_production_cowork_review') ? 'pending' : 'done', evidence: readiness.items.find((i) => i.id === 'broad_production_review_gate')?.status || 'pending' }
    ],
    claim_boundary: CLAIM_BOUNDARY
  };
}

export function proofRoomHtml(id) {
  const safeId = String(id || '').replace(/[^a-zA-Z0-9:_-]/g, '');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Revolv Proof Room</title>
<style>
body{margin:0;background:#F4FAFB;color:#0E2A33;font:15px/1.55 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.shell{max-width:1120px;margin:0 auto;padding:28px 18px 64px}
.top{display:flex;gap:12px;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(14,42,51,.1);padding-bottom:16px}
.brand{font-weight:800}.pill{display:inline-flex;border:1px solid rgba(14,42,51,.12);border-radius:999px;padding:5px 10px;background:#fff;font-size:12px;font-weight:800}
h1{font-family:Georgia,serif;font-weight:400;font-size:42px;line-height:1.1;margin:28px 0 10px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:18px}.card{background:#fff;border:1px solid rgba(14,42,51,.1);border-radius:10px;padding:16px;box-shadow:0 8px 24px rgba(14,42,51,.05)}
h2{font-size:12px;color:#1A7A86;text-transform:uppercase;margin:0 0 10px}.kv{margin:6px 0;color:#3A5560}.kv b{color:#0E2A33}pre{white-space:pre-wrap;overflow:auto;background:#FBFDFD;border:1px solid rgba(14,42,51,.1);border-radius:8px;padding:12px;font-size:12px}
@media(max-width:760px){.grid{grid-template-columns:1fr}h1{font-size:34px}.top{align-items:flex-start;flex-direction:column}}
</style>
</head>
<body><main class="shell">
<div class="top"><div class="brand">DUAL | Revolv Proof Room</div><span class="pill">publicWrites=false</span></div>
<h1 id="title">Proof room loading...</h1>
<p id="subtitle">Revolv proof rooms show offer terms, sponsorship disclosure, mandate/verifier evidence, and the current DUAL/payment boundary.</p>
<section class="grid">
<article class="card"><h2>Offer</h2><div id="offer"></div></article>
<article class="card"><h2>Verifier</h2><div id="verifier"></div></article>
<article class="card"><h2>Brand report</h2><div id="report"></div></article>
<article class="card"><h2>Claim boundary</h2><div id="boundary"></div></article>
</section>
<article class="card" style="margin-top:14px"><h2>Source payload</h2><pre id="payload">Loading...</pre></article>
</main>
<script>
const id=${JSON.stringify(safeId)};
const el=(x)=>document.getElementById(x);
fetch('/api/product/proof-room/'+encodeURIComponent(id)).then(r=>r.json()).then((room)=>{
  el('title').textContent = room.offer?.title || room.program?.name || 'Proof room';
  el('offer').innerHTML = kv('Brand', room.brand?.name || 'n/a') + kv('Sponsored', String(room.disclosure?.sponsored)) + kv('Terms hash', room.disclosure?.terms_hash || 'not minted yet') + kv('State', room.offer?.state || room.subject);
  el('verifier').innerHTML = kv('Status', room.verifier?.status || 'no receipt') + kv('Verified', String(Boolean(room.verifier?.verified))) + kv('Value released', String(Boolean(room.verifier?.value_released)));
  el('report').innerHTML = kv('Billing model', room.report?.billing_model || 'per_verified_outcome') + kv('Verified outcomes', String(room.report?.verified_outcomes || 0)) + kv('Impressions billed', String(room.report?.impressions_billed || 0));
  el('boundary').innerHTML = (room.claim_boundary?.excluded || []).map(x=>'<div class="kv"><b>No:</b> '+escapeHtml(x)+'</div>').join('') + kv('DUAL write mode', room.dual?.writeMode || 'read_only');
  el('payload').textContent = JSON.stringify(room, null, 2);
}).catch((err)=>{ el('title').textContent='Proof room unavailable'; el('payload').textContent=String(err); });
function kv(k,v){ return '<div class="kv"><b>'+escapeHtml(k)+':</b> '+escapeHtml(v)+'</div>'; }
function escapeHtml(v){ return String(v).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
</script></body></html>`;
}

function locateProofSubject(store, id) {
  if (store.offers.has(id)) {
    const offer = store.offers.get(id);
    return { type: 'offer', offer, program: store.programs.get(offer.program_id), receipt: null };
  }
  if (store.receipts.has(id)) {
    const receipt = store.receipts.get(id);
    const offer = store.offers.get(receipt.offer_id);
    return { type: 'receipt', receipt, offer, program: store.programs.get(receipt.program_id) };
  }
  if (store.programs.has(id)) {
    const program = store.programs.get(id);
    const offer = [...store.offers.values()].find((o) => o.program_id === program.id) || null;
    return { type: 'program', offer, program, receipt: null };
  }
  return null;
}

function agentOfferPreview(offer, program, brand) {
  return {
    visible_to_agent: {
      title: offer.title,
      brand: brand.name,
      price: offer.price,
      incentive_value: offer.incentive_value,
      sponsored: true,
      terms_hash: offer.terms_hash,
      source_hash: offer.source_hash,
      eligibility_policy: offer.eligibility_policy
    },
    principal_can_block_with: ['allowSponsored=false', 'merchantAllowlist mismatch', 'spendCeiling below price', 'missing redeem_offer scope'],
    mcp_read_path: ['discover_offers', 'get_offer', 'check_eligibility']
  };
}

function proofRoomSummary(baseUrl, id) {
  const path = `/proof/${encodeURIComponent(id)}`;
  return { id, url: `${String(baseUrl || '').replace(/\/+$/, '')}${path}`, path };
}

function verifierSummary(receipt) {
  return {
    status: receipt.status,
    verified: receipt.verified === true,
    value_released: receipt.verified === true && receipt.status === 'settled',
    receipt_hash: receipt.receipt_hash,
    verified_at: receipt.verified_at || null
  };
}

function slugRef(name) {
  return `brand:${String(name || 'brand').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'brand'}`;
}

function clean(value, fallback, max) {
  const out = typeof value === 'string' && value.trim() ? value.trim() : fallback;
  return out.slice(0, max);
}

function bounded(value, fallback, min, max) {
  const n = Number(value ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}
