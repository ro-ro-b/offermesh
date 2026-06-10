// Agent Gateway MCP — JSON-RPC 2.0 over streamable HTTP (single POST endpoint, JSON responses).
// Read tools are public; reserve/redeem are auth-gated and fail closed with agent_auth_required.
import { timingSafeEqual } from 'node:crypto';
import { publicOffer } from './offers.mjs';
import { discoverOffer, checkEligibility, reserveOffer, redeemOffer, RedemptionError } from './redemption.mjs';
import { verifyReceipt } from './verifier.mjs';
import { dualStatus } from './dualStatus.mjs';
import { runAgent } from './agentSim.mjs';
import { programReport, simulateRewardEpoch } from './settlement.mjs';
import { prepareDualPayload, queueDualSync, executeDualSync } from './dualSync.mjs';

const PROTOCOL_VERSION = '2025-03-26';

export function mcpToolList() {
  return [
    tool('discover_offers', 'List published/discoverable sponsored offers, optionally filtered by category. All offers carry machine-readable sponsored=true disclosure.', {
      category: { type: 'string' }
    }),
    tool('get_offer', 'Get a single offer with terms, eligibility policy, provenance hashes, and sponsorship disclosure.', {
      offer_id: { type: 'string' }
    }, ['offer_id']),
    tool('check_eligibility', 'Evaluate an offer against an agent mandate (scope, spend ceiling, merchant allowlist, expiry, caps, budget). Read-only.', {
      offer_id: { type: 'string' }, mandate_id: { type: 'string' }, agent_id: { type: 'string' }
    }, ['offer_id', 'mandate_id', 'agent_id']),
    tool('reserve_offer', 'Reserve an offer under a mandate (escrow hold). AUTH-GATED: requires verified gateway key; fails closed with agent_auth_required.', {
      offer_id: { type: 'string' }, mandate_id: { type: 'string' }, agent_id: { type: 'string' }
    }, ['offer_id', 'mandate_id', 'agent_id']),
    tool('redeem_offer', 'Redeem a reserved offer and receive a redemption receipt. AUTH-GATED, idempotent via idempotency_key, anti-replay protected.', {
      offer_id: { type: 'string' }, mandate_id: { type: 'string' }, agent_id: { type: 'string' }, idempotency_key: { type: 'string' }
    }, ['offer_id', 'mandate_id', 'agent_id', 'idempotency_key']),
    tool('get_redemption_receipt', 'Fetch a redemption receipt by id. Public payload only (hashes, no PII).', {
      receipt_id: { type: 'string' }
    }, ['receipt_id']),
    tool('verify_receipt', 'Independently verify a redemption receipt. Tampered receipts are flagged for review, never settled. Public.', {
      receipt_id: { type: 'string' }, submitted_receipt: { type: 'object' }
    }, ['receipt_id']),
    tool('get_dual_status', 'Truthful DUAL network posture: read-only, mapping pending, no live writes, no stored credentials.', {}),
    tool('simulate_agent_run', 'Run the autonomous reference agent under a mandate: discover → policy filter → score → reserve → redeem → verify, with full decision trace. AUTH-GATED.', {
      mandate_id: { type: 'string' }, agent_id: { type: 'string' }, auto_verify: { type: 'boolean' }
    }, ['mandate_id', 'agent_id']),
    tool('get_program_report', 'Per-verified-outcome settlement report for a brand program (impressions billed is always 0).', {
      program_id: { type: 'string' }
    }, ['program_id']),
    tool('get_reward_epoch', 'Simulated, non-financial reward epoch for a program. Legal review required before any financial reward.', {
      program_id: { type: 'string' }
    }, ['program_id']),
    tool('get_proof_events', 'Append-only proof event log (hashed). Public payloads only.', {
      limit: { type: 'number' }
    }),
    tool('prepare_dual_sync', 'Read-only preview of the DUAL anchoring payload for a redemption receipt. Never writes.', {
      receipt_id: { type: 'string' }
    }, ['receipt_id']),
    tool('queue_dual_sync', 'Queue a VERIFIED receipt for operator-gated DUAL anchoring. AUTH-GATED; execution additionally requires operator token + explicit flag and is mapping-pending in this build.', {
      receipt_id: { type: 'string' }
    }, ['receipt_id'])
  ];
}

function tool(name, description, props, required = []) {
  return { name, description, inputSchema: { type: 'object', properties: props, required } };
}

const AUTH_GATED = new Set(['reserve_offer', 'redeem_offer', 'simulate_agent_run', 'queue_dual_sync']);

export function isAuthorized(req) {
  const expected = process.env.OFFERMESH_GATEWAY_KEY || '';
  if (!expected) return false; // fail closed: no key configured -> no writes
  const got = req.headers['x-offermesh-gateway-key'] || '';
  if (typeof got !== 'string' || got.length !== expected.length) return false;
  try { return timingSafeEqual(Buffer.from(got), Buffer.from(expected)); } catch { return false; }
}

export function handleMcp(store, body, req) {
  const { id = null, method, params = {} } = body || {};
  const reply = (result) => ({ jsonrpc: '2.0', id, result });
  const fail = (code, message, data) => ({ jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } });

  try {
    switch (method) {
      case 'initialize':
        return reply({
          protocolVersion: PROTOCOL_VERSION,
          serverInfo: { name: 'offermesh-agent-gateway', version: '0.1.0' },
          capabilities: { tools: {}, resources: {} }
        });
      case 'notifications/initialized':
        return null; // notification, no response body
      case 'ping':
        return reply({});
      case 'tools/list':
        return reply({ tools: mcpToolList() });
      case 'resources/list':
        return reply({ resources: [
          { uri: 'offermesh://disclosure-policy', name: 'Sponsorship disclosure policy', mimeType: 'application/json' },
          { uri: 'offermesh://dual-status', name: 'DUAL posture', mimeType: 'application/json' }
        ] });
      case 'resources/read': {
        if (params.uri === 'offermesh://disclosure-policy') {
          return reply({ contents: [{ uri: params.uri, mimeType: 'application/json', text: JSON.stringify({
            sponsored_field_required: true,
            incentive_terms_public: true,
            principal_policy_filtering: 'Principals may instruct agents to deprioritise or exclude sponsored offers; the disclosure field makes this enforceable.',
            rationale: 'The honest ad network for agents: paid influence is machine-readable, never covert.'
          }, null, 2) }] });
        }
        if (params.uri === 'offermesh://dual-status') {
          return reply({ contents: [{ uri: params.uri, mimeType: 'application/json', text: JSON.stringify(dualStatus(), null, 2) }] });
        }
        return fail(-32602, 'unknown resource');
      }
      case 'tools/call':
        return toolCall(store, params, req, reply, fail);
      default:
        return fail(-32601, `method not found: ${method}`);
    }
  } catch (err) {
    return fail(-32000, err.code || err.message || 'internal_error', err.reasons ? { reasons: err.reasons } : undefined);
  }
}

function toolCall(store, params, req, reply, fail) {
  const { name, arguments: args = {} } = params;
  if (AUTH_GATED.has(name) && !isAuthorized(req)) {
    return reply(content({ status: 'agent_auth_required', tool: name,
      detail: 'Verified gateway key required. Self-declared scopes are not sufficient. No state was changed.' }));
  }
  try {
    switch (name) {
      case 'discover_offers': {
        const offers = [...store.offers.values()]
          .filter((o) => ['published', 'discovered'].includes(o.state))
          .filter((o) => !args.category || o.category === args.category)
          .map(publicOffer);
        return reply(content({ count: offers.length, sponsored_disclosure: 'all offers carry sponsored=true', offers }));
      }
      case 'get_offer': {
        const offer = store.offers.get(args.offer_id);
        if (!offer) return reply(content({ status: 'offer_not_found' }));
        discoverOffer(store, args.offer_id, args.agent_id || 'mcp-agent');
        return reply(content(publicOffer(offer)));
      }
      case 'check_eligibility':
        return reply(content(checkEligibility(store, { offerId: args.offer_id, mandateId: args.mandate_id, agentId: args.agent_id })));
      case 'reserve_offer': {
        const offer = reserveOffer(store, { offerId: args.offer_id, mandateId: args.mandate_id, agentId: args.agent_id });
        return reply(content({ status: 'reserved', offer_id: offer.id, state: offer.state }));
      }
      case 'redeem_offer': {
        const { receipt, idempotent_replay } = redeemOffer(store, {
          offerId: args.offer_id, mandateId: args.mandate_id, agentId: args.agent_id, idempotencyKey: args.idempotency_key
        });
        return reply(content({ status: 'redeemed', idempotent_replay, receipt }));
      }
      case 'get_redemption_receipt': {
        const receipt = store.receipts.get(args.receipt_id);
        return reply(content(receipt || { status: 'receipt_not_found' }));
      }
      case 'verify_receipt':
        return reply(content(verifyReceipt(store, args.receipt_id, args.submitted_receipt || null)));
      case 'get_dual_status':
        return reply(content(dualStatus()));
      case 'simulate_agent_run':
        return reply(content(runAgent(store, { mandateId: args.mandate_id, agentId: args.agent_id, autoVerify: args.auto_verify !== false })));
      case 'get_program_report': {
        const report = programReport(store, args.program_id);
        return reply(content(report || { status: 'program_not_found' }));
      }
      case 'get_reward_epoch':
        return reply(content(simulateRewardEpoch(store, args.program_id)));
      case 'get_proof_events': {
        const limit = Math.min(Number(args.limit) || 50, 200);
        return reply(content({ count: store.events.length, events: store.events.slice(-limit) }));
      }
      case 'prepare_dual_sync':
        return reply(content(prepareDualPayload(store, args.receipt_id)));
      case 'queue_dual_sync':
        return reply(content(queueDualSync(store, args.receipt_id)));
      default:
        return fail(-32602, `unknown tool: ${name}`);
    }
  } catch (err) {
    if (err instanceof RedemptionError || err.name === 'OfferError') {
      return reply(content({ status: 'blocked', code: err.code, reasons: err.reasons || [] }));
    }
    throw err;
  }
}

function content(obj) {
  return { content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] };
}
