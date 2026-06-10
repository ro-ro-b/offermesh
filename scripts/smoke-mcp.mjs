// MCP smoke — JSON-RPC over streamable HTTP, including unauthenticated fail-closed assertions.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4398;
const BASE = `http://127.0.0.1:${PORT}`;

let failures = 0;
let rpcId = 0;
function assert(name, cond, extra) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name}`, extra ?? ''); }
}
const rpc = (method, params = {}, headers = {}) =>
  fetch(BASE + '/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params })
  }).then((r) => r.json());
const toolText = (resp) => JSON.parse(resp.result.content[0].text);

const child = spawn(process.execPath, ['server.mjs'], {
  cwd: new URL('..', import.meta.url).pathname,
  env: { ...process.env, PORT: String(PORT), OFFERMESH_GATEWAY_KEY: 'mcp-smoke-key', OFFERMESH_EPHEMERAL: '1', OFFERMESH_ADMIN_TOKEN: 'mcp-admin',
    KV_REST_API_URL: '', KV_REST_API_TOKEN: '', UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '' },
  stdio: 'ignore'
});

try {
  let up = false;
  for (let i = 0; i < 40 && !up; i++) { try { await rpc('ping'); up = true; } catch { await sleep(150); } }
  if (!up) throw new Error('server did not start');

  const init = await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
  assert('initialize ok', init.result.serverInfo.name === 'revolv-offermesh-agent-gateway' && init.result.serverInfo.product === 'revolv' && init.result.serverInfo.version === '0.7.0');

  const tools = await rpc('tools/list');
  assert('26 tools listed', tools.result.tools.length === 26, tools.result.tools.length);
  assert('v0.7.0 product tools present', ['get_agent_marketplace', 'get_brand_dashboard', 'get_proof_room', 'get_reference_agent_guide', 'get_partner_hardening_plan'].every((name) => tools.result.tools.some((t) => t.name === name)));

  const resources = await rpc('resources/list');
  assert('15 resources listed', resources.result.resources.length === 15, resources.result.resources.length);
  assert('disclosure policy resource present', resources.result.resources.some((r) => r.uri === 'revolv://disclosure-policy'));
  assert('readiness resources present', ['revolv://market-pack', 'revolv://dual-live-readback-plan', 'revolv://saas-hardening', 'revolv://production-readiness', 'revolv://public-identity', 'revolv://customer-session-drill', 'revolv://incident-runbook'].every((uri) => resources.result.resources.some((r) => r.uri === uri)));
  assert('v0.7.0 product resources present', ['revolv://agent-marketplace', 'revolv://brand-dashboard', 'revolv://reference-agent', 'revolv://partner-hardening'].every((uri) => resources.result.resources.some((r) => r.uri === uri)));
  const policy = await rpc('resources/read', { uri: 'revolv://disclosure-policy' });
  assert('disclosure policy readable', JSON.parse(policy.result.contents[0].text).sponsored_field_required === true);
  const marketResource = await rpc('resources/read', { uri: 'revolv://market-pack' });
  assert('market pack resource readable', JSON.parse(marketResource.result.contents[0].text).product === 'Revolv');
  const agentResource = await rpc('resources/read', { uri: 'revolv://agent-marketplace' });
  assert('agent marketplace resource readable', JSON.parse(agentResource.result.contents[0].text).status === 'agent_marketplace_ready');

  const discover = toolText(await rpc('tools/call', { name: 'discover_offers', arguments: {} }));
  assert('discover returns sponsored offers', discover.count >= 2 && discover.offers.every((o) => o.sponsored === true));
  const offerId = discover.offers[0].id;

  const offer = toolText(await rpc('tools/call', { name: 'get_offer', arguments: { offer_id: offerId } }));
  assert('get_offer has provenance hashes', offer.source_hash.startsWith('0x') && offer.terms_hash.startsWith('0x'));
  const agentMarket = toolText(await rpc('tools/call', { name: 'get_agent_marketplace', arguments: {} }));
  assert('agent marketplace tool returns action path', agentMarket.status === 'agent_marketplace_ready' && agentMarket.offers[0].mcp_tools.includes('redeem_offer'));

  // seed mandate ids via REST seed-info (same server)
  const seedInfo = await fetch(BASE + '/api/seed-info').then((r) => r.json());

  const elig = toolText(await rpc('tools/call', { name: 'check_eligibility', arguments: { offer_id: offerId, mandate_id: seedInfo.good_mandate_id, agent_id: 'agent:claude-reference' } }));
  assert('eligibility evaluates', elig.eligible === true);

  // unauthenticated write tools fail closed
  const resNoAuth = toolText(await rpc('tools/call', { name: 'reserve_offer', arguments: { offer_id: offerId, mandate_id: seedInfo.good_mandate_id, agent_id: 'agent:claude-reference' } }));
  assert('reserve without auth -> agent_auth_required', resNoAuth.status === 'agent_auth_required');
  const redNoAuth = toolText(await rpc('tools/call', { name: 'redeem_offer', arguments: { offer_id: offerId, mandate_id: seedInfo.good_mandate_id, agent_id: 'agent:claude-reference', idempotency_key: 'mcp-1' } }));
  assert('redeem without auth -> agent_auth_required', redNoAuth.status === 'agent_auth_required');

  // authenticated path
  const auth = { 'x-offermesh-gateway-key': 'mcp-smoke-key' };
  const resAuth = toolText(await rpc('tools/call', { name: 'reserve_offer', arguments: { offer_id: offerId, mandate_id: seedInfo.good_mandate_id, agent_id: 'agent:claude-reference' } }, auth));
  assert('reserve with auth ok', resAuth.status === 'reserved');
  const redAuth = toolText(await rpc('tools/call', { name: 'redeem_offer', arguments: { offer_id: offerId, mandate_id: seedInfo.good_mandate_id, agent_id: 'agent:claude-reference', idempotency_key: 'mcp-2' } }, auth));
  assert('redeem with auth ok', redAuth.status === 'redeemed' && redAuth.receipt.receipt_hash.startsWith('0x'));
  assert('receipt has no raw agent id', !JSON.stringify(redAuth.receipt).includes('agent:claude-reference'));

  const verify = toolText(await rpc('tools/call', { name: 'verify_receipt', arguments: { receipt_id: redAuth.receipt.id } }));
  assert('verify settles via MCP', verify.verified === true);
  const proofRoom = toolText(await rpc('tools/call', { name: 'get_proof_room', arguments: { id: redAuth.receipt.id } }));
  assert('proof room tool is read-only package', proofRoom.status === 'proof_room_ready' && proofRoom.verifier.verified === true && proofRoom.dual.liveDualWrites === false);

  const dual = toolText(await rpc('tools/call', { name: 'get_dual_status', arguments: {} }));
  assert('dual status truthful via MCP', dual.liveDualWrites === false && dual.writeMode === 'read_only');
  assert('dual status says Revolv/OfferMesh', dual.product === 'revolv' && dual.engine === 'offermesh');

  const unknown = await rpc('tools/call', { name: 'not_a_tool', arguments: {} });
  assert('unknown tool errors', Boolean(unknown.error));

  // ---- v0.2.0 tools ----
  const simNoAuth = toolText(await rpc('tools/call', { name: 'simulate_agent_run', arguments: { mandate_id: seedInfo.good_mandate_id, agent_id: 'agent:x' } }));
  assert('simulate without auth -> agent_auth_required', simNoAuth.status === 'agent_auth_required');
  const sim = toolText(await rpc('tools/call', { name: 'simulate_agent_run', arguments: { mandate_id: seedInfo.no_sponsored_mandate_id, agent_id: 'agent:unsponsored' } }, auth));
  assert('unsponsored principal sim -> no action', sim.outcome === 'no_offers_within_principal_policy');

  const report = toolText(await rpc('tools/call', { name: 'get_program_report', arguments: { program_id: seedInfo.program_id } }));
  assert('program report via MCP', report.billing_model === 'per_verified_outcome' && report.impressions_billed === 0);

  const epoch = toolText(await rpc('tools/call', { name: 'get_reward_epoch', arguments: { program_id: seedInfo.program_id } }));
  assert('reward epoch simulated via MCP', epoch.simulated === true && epoch.financial_reward === false);

  const events = toolText(await rpc('tools/call', { name: 'get_proof_events', arguments: { limit: 10 } }));
  assert('proof events via MCP', events.count > 5 && events.events.length <= 10);

  const prep = toolText(await rpc('tools/call', { name: 'prepare_dual_sync', arguments: { receipt_id: redAuth.receipt.id } }));
  assert('dual payload preview via MCP, no write', prep.write_executed === false && prep.mapping_pending === true);

  const qNoAuth = toolText(await rpc('tools/call', { name: 'queue_dual_sync', arguments: { receipt_id: redAuth.receipt.id } }));
  assert('queue_dual_sync without auth -> agent_auth_required', qNoAuth.status === 'agent_auth_required');
  const q = toolText(await rpc('tools/call', { name: 'queue_dual_sync', arguments: { receipt_id: redAuth.receipt.id } }, auth));
  assert('queue_dual_sync queues verified receipt', q.status === 'queued');

  const pack = toolText(await rpc('tools/call', { name: 'get_revolv_market_pack', arguments: {} }));
  assert('market pack tool returns Revolv', pack.product === 'Revolv' && pack.status === 'market_pack_ready');
  const plan = toolText(await rpc('tools/call', { name: 'get_dual_live_readback_plan', arguments: {} }));
  assert('dual readback plan tool is planning only', plan.status === 'plan_ready_live_write_not_approved' && plan.write_gate.required === true);
  const hardening = toolText(await rpc('tools/call', { name: 'get_saas_hardening_contract', arguments: {} }));
  assert('hardening tool returns rate-limit posture', hardening.rate_limit_mode.mode === 'local_token_bucket');
  const identity = toolText(await rpc('tools/call', { name: 'get_public_identity', arguments: {} }));
  assert('public identity tool returns canonical /revolv', identity.canonical_public_url.endsWith('/revolv'));
  const prod = toolText(await rpc('tools/call', { name: 'get_production_readiness', arguments: {} }));
  assert('production readiness tool blocks broad claim', prod.production_ready_claim_allowed === false && prod.blockers.includes('broad_production_cowork_review'));
  assert('partner-ready tool claim blocked before broad review', prod.partner_ready_claim_allowed === false && prod.claim_profiles.partner_ready_pilot.blockers.includes('broad_partner_ready_cowork_review'));
  const drill = toolText(await rpc('tools/call', { name: 'get_customer_session_drill', arguments: {} }));
  assert('customer session drill tool returns evidence checklist', drill.required_evidence.length >= 4);
  const runbook = toolText(await rpc('tools/call', { name: 'get_incident_runbook', arguments: {} }));
  assert('incident runbook tool returns fail-closed paths', runbook.fail_closed_paths.includes('OIDC when configured'));
  const brandDashboard = toolText(await rpc('tools/call', { name: 'get_brand_dashboard', arguments: {} }));
  assert('brand dashboard tool returns zero impressions billed', brandDashboard.status === 'brand_dashboard_ready' && brandDashboard.impressions_billed === 0);
  const referenceAgent = toolText(await rpc('tools/call', { name: 'get_reference_agent_guide', arguments: {} }));
  assert('reference agent guide tool returns MCP loop', referenceAgent.loop.includes('discover_offers') && referenceAgent.required_auth.live_dual_execution.includes('operator-gated'));
  const partnerHardening = toolText(await rpc('tools/call', { name: 'get_partner_hardening_plan', arguments: {} }));
  assert('partner hardening tool keeps claim blocked', partnerHardening.status === 'partner_hardening_plan_ready' && partnerHardening.partner_ready_claim_allowed === false);

  // ---- per-tenant gateway key works on MCP ----
  const tnt = await fetch(BASE + '/api/admin/tenants', { method: 'POST', headers: { 'content-type': 'application/json', 'x-offermesh-admin-token': 'mcp-admin' }, body: JSON.stringify({ name: 'MCP Tenant' }) }).then((r) => r.json());
  const tAuth = { 'x-offermesh-gateway-key': tnt.gateway_key };
  const tSim = toolText(await rpc('tools/call', { name: 'simulate_agent_run', arguments: { mandate_id: seedInfo.no_sponsored_mandate_id, agent_id: 'agent:tenant-mcp' } }, tAuth));
  assert('tenant gateway key authorizes MCP tools', tSim.outcome === 'no_offers_within_principal_policy');
  const wrongAuth = { 'x-offermesh-gateway-key': 'omg_' + 'a'.repeat(48) };
  const wrongSim = toolText(await rpc('tools/call', { name: 'simulate_agent_run', arguments: { mandate_id: seedInfo.no_sponsored_mandate_id, agent_id: 'agent:x' } }, wrongAuth));
  assert('unknown tenant key fails closed', wrongSim.status === 'agent_auth_required');
} catch (err) {
  failures++;
  console.error('FAIL mcp smoke crashed:', err.message);
} finally {
  child.kill();
}

if (failures > 0) { console.error(`\nmcp smoke FAILED (${failures})`); process.exit(1); }
console.log('\nmcp smoke PASSED');
