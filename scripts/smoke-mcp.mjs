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
  env: { ...process.env, PORT: String(PORT), OFFERMESH_GATEWAY_KEY: 'mcp-smoke-key', OFFERMESH_EPHEMERAL: '1' },
  stdio: 'ignore'
});

try {
  let up = false;
  for (let i = 0; i < 40 && !up; i++) { try { await rpc('ping'); up = true; } catch { await sleep(150); } }
  if (!up) throw new Error('server did not start');

  const init = await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
  assert('initialize ok', init.result.serverInfo.name === 'offermesh-agent-gateway');

  const tools = await rpc('tools/list');
  assert('14 tools listed', tools.result.tools.length === 14, tools.result.tools.length);

  const resources = await rpc('resources/list');
  assert('disclosure policy resource present', resources.result.resources.some((r) => r.uri === 'offermesh://disclosure-policy'));
  const policy = await rpc('resources/read', { uri: 'offermesh://disclosure-policy' });
  assert('disclosure policy readable', JSON.parse(policy.result.contents[0].text).sponsored_field_required === true);

  const discover = toolText(await rpc('tools/call', { name: 'discover_offers', arguments: {} }));
  assert('discover returns sponsored offers', discover.count >= 2 && discover.offers.every((o) => o.sponsored === true));
  const offerId = discover.offers[0].id;

  const offer = toolText(await rpc('tools/call', { name: 'get_offer', arguments: { offer_id: offerId } }));
  assert('get_offer has provenance hashes', offer.source_hash.startsWith('0x') && offer.terms_hash.startsWith('0x'));

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

  const dual = toolText(await rpc('tools/call', { name: 'get_dual_status', arguments: {} }));
  assert('dual status truthful via MCP', dual.liveDualWrites === false && dual.writeMode === 'read_only');

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
} catch (err) {
  failures++;
  console.error('FAIL mcp smoke crashed:', err.message);
} finally {
  child.kill();
}

if (failures > 0) { console.error(`\nmcp smoke FAILED (${failures})`); process.exit(1); }
console.log('\nmcp smoke PASSED');
