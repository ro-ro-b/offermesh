// Revolv app — shared request handler for local server and Vercel serverless adapter.
// OfferMesh remains the underlying SaaS/protocol engine and compatibility surface.
// v0.3.0: multi-tenant SaaS layer — durable storage, hashed tenant keys, admin plane,
// usage metering, rate limiting, security headers, ops monitor + truthful readiness scorecard.
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createStore, logEvent, persist, restore, persistRemote, restoreRemote, flushRemote } from './store.mjs';
import { createStorage } from './storage.mjs';
import { seed } from '../data/seed.mjs';
import { createBrand, createProgram, createOffer, pauseProgram, resumeProgram, topUpProgram, publicOffer, OfferError } from './offers.mjs';
import { createMandate, revokeMandate } from './mandates.mjs';
import { discoverOffer, checkEligibility, reserveOffer, redeemOffer, RedemptionError } from './redemption.mjs';
import { verifyReceipt, disputeReceipt } from './verifier.mjs';
import { programReport, simulateRewardEpoch } from './settlement.mjs';
import { dualStatus } from './dualStatus.mjs';
import { handleMcp, isAuthorized } from './mcp.mjs';
import { runAgent } from './agentSim.mjs';
import { prepareDualPayload, queueDualSync, executeDualSync } from './dualSync.mjs';
import { sourceReviewBundle } from './sourceReview.mjs';
import { createTenant, rotateTenantKeys, setTenantStatus, publicTenant, resolveTenantByApiKey, isAdmin, TenantError } from './tenants.mjs';
import { meter, tenantUsage, billingRecord, allUsage } from './metering.mjs';
import { rateLimit } from './ratelimit.mjs';
import { monitor, readiness } from './ops.mjs';

const __dirname = join(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '0.3.0';
const STARTED_AT = new Date().toISOString();

const store = createStore();
const bootInfo = { restored: false, mode: 'ephemeral' };

const ready = (async () => {
  const remote = createStorage();
  if (remote) {
    bootInfo.mode = remote.kind;
    try { bootInfo.restored = await restoreRemote(store, remote); }
    catch (err) { bootInfo.restoreError = String(err.message || err); }
  } else if (process.env.OFFERMESH_EPHEMERAL !== '1') {
    const statePath = process.env.OFFERMESH_STATE_PATH || join(__dirname, 'data', 'state.json');
    bootInfo.mode = 'file';
    bootInfo.restored = restore(store, statePath);
  }
  if (store.programs.size === 0) {
    seed(store, {
      demoGatewayKey: process.env.OFFERMESH_GATEWAY_KEY || null,
      demoConsoleKey: process.env.OFFERMESH_DEMO_CONSOLE_KEY || null
    });
    await flushRemote(store);
    persist(store);
  }
})();

function save() {
  try { persist(store); } catch { /* best-effort */ }
  persistRemote(store);
}

export async function handle(req, res) {
  await ready;
  const requestId = randomUUID().slice(0, 8);
  res.setHeader('x-request-id', requestId);
  setSecurityHeaders(res);
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method === 'POST' && url.pathname === '/mcp') {
      const rl = rateLimit(req, 'mcp');
      if (!rl.allowed) return send(res, 429, { error: 'rate_limited', retry_after_seconds: rl.retry_after_seconds });
      const body = await readJson(req);
      const out = handleMcp(store, body, req);
      save();
      if (out === null) return send(res, 202, {});
      return send(res, 200, out);
    }
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    return serveStatic(req, res, url);
  } catch (err) {
    if (err.message === 'payload_too_large' || err.message === 'invalid_json') {
      return send(res, 400, { error: err.message, request_id: requestId });
    }
    return send(res, 500, { error: 'internal_error', request_id: requestId });
  }
}

export const meta = { VERSION, STARTED_AT };

async function api(req, res, url) {
  const p = url.pathname;
  const method = req.method;
  const cls = p.startsWith('/api/admin/') ? 'admin' : method === 'GET' ? 'read' : 'write';
  const rl = rateLimit(req, cls);
  if (!rl.allowed) return send(res, 429, { error: 'rate_limited', retry_after_seconds: rl.retry_after_seconds });

  // ---- service status / ops ----
  if (method === 'GET' && p === '/api/status') {
    return send(res, 200, {
      service: 'revolv', product: 'revolv', engine: 'offermesh', version: VERSION, started_at: STARTED_AT,
      storage: { mode: bootInfo.mode, restored: bootInfo.restored, last_remote_save: store.lastRemoteSave || null, last_remote_error: store.lastRemoteError || null },
      counts: { tenants: store.tenants.size, brands: store.brands.size, programs: store.programs.size, offers: store.offers.size, mandates: store.mandates.size, receipts: store.receipts.size, ledger: store.ledger.length, events: store.events.length },
      gate: { agent_gateway_key_configured: Boolean(process.env.OFFERMESH_GATEWAY_KEY) || store.tenants.size > 0, admin_token_configured: Boolean(process.env.OFFERMESH_ADMIN_TOKEN), operator_token_configured: Boolean(process.env.OFFERMESH_OPERATOR_TOKEN) },
      dual: dualStatus()
    });
  }
  if (method === 'GET' && p === '/api/dual/status') return send(res, 200, dualStatus());
  if (method === 'GET' && p === '/api/ops/monitor') return send(res, 200, monitor(store));
  if (method === 'GET' && p === '/api/ops/readiness') return send(res, 200, readiness(store));
  if (method === 'GET' && p === '/api/source/review-bundle') return send(res, 200, sourceReviewBundle(VERSION));

  // ---- admin plane (fail-closed token) ----
  if (p.startsWith('/api/admin/')) {
    if (!isAdmin(req)) return send(res, 401, { status: 'admin_auth_required', detail: 'x-offermesh-admin-token missing/invalid or not configured. Fails closed.' });
    if (method === 'POST' && p === '/api/admin/tenants') {
      const b = await readJson(req);
      return guard(res, () => { const out = createTenant(store, { name: str(b.name, 80) }); save(); return send(res, 201, { ...out, note: 'Store these keys now — they are shown once and held only as hashes.' }); });
    }
    if (method === 'GET' && p === '/api/admin/tenants') {
      return send(res, 200, { tenants: [...store.tenants.values()].map(publicTenant) });
    }
    if (method === 'POST' && /^\/api\/admin\/tenants\/[^/]+\/rotate$/.test(p)) {
      return guard(res, () => { const out = rotateTenantKeys(store, p.split('/')[4]); save(); return send(res, 200, out); });
    }
    if (method === 'POST' && /^\/api\/admin\/tenants\/[^/]+\/(suspend|resume)$/.test(p)) {
      const action = p.split('/')[5];
      return guard(res, () => { const out = setTenantStatus(store, p.split('/')[4], action === 'suspend' ? 'suspended' : 'active'); save(); return send(res, 200, out); });
    }
    if (method === 'GET' && p === '/api/admin/usage') return send(res, 200, { usage: allUsage(store) });
    if (method === 'GET' && /^\/api\/admin\/billing\/[^/]+\/[0-9]{4}-[0-9]{2}$/.test(p)) {
      const parts = p.split('/');
      const record = billingRecord(store, parts[4], parts[5]);
      return record ? send(res, 200, record) : send(res, 404, { error: 'no_usage_for_month' });
    }
    return send(res, 404, { error: 'not_found' });
  }

  // ---- tenant self-service (tenant API key) ----
  if (p.startsWith('/api/tenant/')) {
    const tenant = resolveTenantByApiKey(store, req.headers['x-offermesh-tenant-key']);
    if (!tenant) return send(res, 401, tenantAuthRequired());
    if (tenant.blocked) return send(res, 403, { status: 'tenant_suspended' });
    if (method === 'GET' && p === '/api/tenant/me') return send(res, 200, publicTenant(tenant));
    if (method === 'GET' && p === '/api/tenant/usage') return send(res, 200, tenantUsage(store, tenant.id));
    if (method === 'GET' && /^\/api\/tenant\/billing\/[0-9]{4}-[0-9]{2}$/.test(p)) {
      const record = billingRecord(store, tenant.id, p.split('/')[4]);
      return record ? send(res, 200, record) : send(res, 404, { error: 'no_usage_for_month' });
    }
    return send(res, 404, { error: 'not_found' });
  }

  // ---- public reads ----
  if (method === 'GET' && p === '/api/brands') return send(res, 200, { brands: [...store.brands.values()] });
  if (method === 'GET' && p === '/api/offers') {
    const offers = [...store.offers.values()].map(publicOffer);
    return send(res, 200, { count: offers.length, offers });
  }
  if (method === 'GET' && p.startsWith('/api/offers/')) {
    const offer = store.offers.get(p.split('/')[3]);
    return offer ? send(res, 200, publicOffer(offer)) : send(res, 404, { error: 'offer_not_found' });
  }
  if (method === 'GET' && p === '/api/mandates') return send(res, 200, { mandates: [...store.mandates.values()] });
  if (method === 'GET' && p === '/api/programs') return send(res, 200, { programs: [...store.programs.values()] });
  if (method === 'GET' && p === '/api/receipts') return send(res, 200, { receipts: [...store.receipts.values()] });
  if (method === 'GET' && p.startsWith('/api/receipts/')) {
    const receipt = store.receipts.get(p.split('/')[3]);
    return receipt ? send(res, 200, receipt) : send(res, 404, { error: 'receipt_not_found' });
  }
  if (method === 'GET' && p.startsWith('/api/report/')) {
    const report = programReport(store, p.split('/')[3]);
    return report ? send(res, 200, report) : send(res, 404, { error: 'program_not_found' });
  }
  if (method === 'GET' && p.startsWith('/api/reward-epoch/')) {
    return send(res, 200, simulateRewardEpoch(store, p.split('/')[3]));
  }
  if (method === 'GET' && p === '/api/events') {
    const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 500);
    return send(res, 200, { count: store.events.length, events: store.events.slice(-limit) });
  }
  if (method === 'GET' && p === '/api/dual-queue') return send(res, 200, { queue: [...store.dualQueue.values()] });
  if (method === 'GET' && p === '/api/seed-info') {
    const programs = [...store.programs.values()];
    const mandates = [...store.mandates.values()];
    return send(res, 200, {
      program_id: programs[0]?.id, program2_id: (programs[1] || programs[0])?.id,
      offer_ids: [...store.offers.keys()],
      good_mandate_id: mandates.find((m) => m.agent_id === 'agent:claude-reference')?.id,
      narrow_mandate_id: mandates.find((m) => m.agent_id === 'agent:narrow-scope')?.id,
      no_sponsored_mandate_id: mandates.find((m) => m.agent_id === 'agent:unsponsored')?.id,
      brand_ids: [...store.brands.keys()]
    });
  }

  // ---- brand console (tenant API key required) ----
  if (method === 'POST' && (p === '/api/programs' || p === '/api/offers' || p === '/api/brands' || /^\/api\/programs\/[^/]+\/(pause|resume|topup)$/.test(p))) {
    const tenant = resolveTenantByApiKey(store, req.headers['x-offermesh-tenant-key']);
    if (!tenant) return send(res, 401, tenantAuthRequired());
    if (tenant.blocked) return send(res, 403, { status: 'tenant_suspended' });

    if (p === '/api/brands') {
      const b = await readJson(req);
      return guard(res, () => sendSave(res, 201, createBrand(store, { name: str(b.name, 80), ref: b.ref ? str(b.ref, 80) : undefined })));
    }
    if (p === '/api/programs') {
      const b = await readJson(req);
      return guard(res, () => {
        const program = createProgram(store, { tenantId: tenant.id, brandRef: str(b.brandRef, 80), name: str(b.name, 120), rewardUnit: b.rewardUnit ? str(b.rewardUnit, 40) : undefined, budgetEscrow: num(b.budgetEscrow, 1, 1e9), policy: b.policy });
        meter(store, tenant.id, 'programs_created');
        return sendSave(res, 201, program);
      });
    }
    if (p === '/api/offers') {
      const b = await readJson(req);
      return guard(res, () => {
        const program = store.programs.get(b.programId);
        if (program && program.tenant_id && program.tenant_id !== tenant.id) return send(res, 403, { status: 'wrong_tenant_for_program' });
        const offer = createOffer(store, b.programId, { title: str(b.title, 160), category: b.category ? str(b.category, 40) : undefined, merchant: b.merchant ? str(b.merchant, 80) : undefined, price: num(b.price, 0.01, 1e9), incentiveValue: num(b.incentiveValue, 0.01, 1e9), incentiveType: b.incentiveType ? str(b.incentiveType, 40) : undefined, expiresAt: b.expiresAt, terms: b.terms ? str(b.terms, 500) : undefined });
        meter(store, tenant.id, 'offers_minted');
        return sendSave(res, 201, offer);
      });
    }
    const programId = p.split('/')[3];
    const program = store.programs.get(programId);
    if (program && program.tenant_id && program.tenant_id !== tenant.id) return send(res, 403, { status: 'wrong_tenant_for_program' });
    if (p.endsWith('/pause')) return guard(res, () => sendSave(res, 200, pauseProgram(store, programId)));
    if (p.endsWith('/resume')) return guard(res, () => sendSave(res, 200, resumeProgram(store, programId)));
    if (p.endsWith('/topup')) {
      const b = await readJson(req);
      return guard(res, () => sendSave(res, 200, topUpProgram(store, programId, num(b.amount, 0.01, 1e9))));
    }
  }

  // ---- principal (phase-2 IdP; open + rate-limited for demo) ----
  if (method === 'POST' && p === '/api/mandates') {
    const b = await readJson(req);
    return guard(res, () => sendSave(res, 201, createMandate(store, { principalRef: str(b.principalRef, 80), agentId: str(b.agentId, 80), scope: b.scope, spendCeiling: num(b.spendCeiling, 1, 1e9), merchantAllowlist: b.merchantAllowlist, allowSponsored: b.allowSponsored, expiresAt: b.expiresAt })));
  }
  if (method === 'POST' && /^\/api\/mandates\/[^/]+\/revoke$/.test(p)) {
    const m = revokeMandate(store, p.split('/')[3]);
    save();
    return m ? send(res, 200, m) : send(res, 404, { error: 'mandate_not_found' });
  }

  // ---- agent actions (gateway key: per-tenant or demo env) ----
  if (method === 'POST' && p === '/api/agent/discover') {
    const b = await readJson(req);
    return guard(res, () => sendSave(res, 200, publicOffer(discoverOffer(store, b.offerId, b.agentId))));
  }
  if (method === 'POST' && p === '/api/agent/eligibility') {
    const b = await readJson(req);
    return guard(res, () => send(res, 200, checkEligibility(store, b)));
  }
  if (method === 'POST' && p === '/api/agent/reserve') {
    if (!isAuthorized(req, store)) return send(res, 401, authRequired());
    const b = await readJson(req);
    return guard(res, () => sendSave(res, 200, { status: 'reserved', offer: publicOffer(reserveOffer(store, b)) }));
  }
  if (method === 'POST' && p === '/api/agent/redeem') {
    if (!isAuthorized(req, store)) return send(res, 401, authRequired());
    const b = await readJson(req);
    return guard(res, () => {
      const { receipt, idempotent_replay } = redeemOffer(store, b);
      if (!idempotent_replay) meterProgramTenant(store, receipt.program_id, 'redemptions');
      return sendSave(res, 200, { status: 'redeemed', idempotent_replay, receipt });
    });
  }
  if (method === 'POST' && p === '/api/agent/simulate') {
    if (!isAuthorized(req, store)) return send(res, 401, authRequired());
    const b = await readJson(req);
    return guard(res, () => {
      const result = runAgent(store, { mandateId: b.mandateId, agentId: b.agentId, autoVerify: b.autoVerify !== false });
      if (result.outcome === 'completed') {
        meterProgramTenant(store, result.selected_offer.program_id, 'agent_simulations');
        if (!result.verification) {
          // verification handled below only when present
        } else if (result.verification.verified && result.verification.value_released) {
          meterProgramTenant(store, result.selected_offer.program_id, 'verified_outcomes');
          meterProgramTenant(store, result.selected_offer.program_id, 'outcome_spend', result.selected_offer.incentive_value);
        }
        meterProgramTenant(store, result.selected_offer.program_id, 'redemptions');
      }
      return sendSave(res, 200, result);
    });
  }

  // ---- verifier ----
  if (method === 'POST' && p === '/api/verify') {
    const b = await readJson(req);
    const before = store.receipts.get(b.receiptId)?.verified;
    const result = verifyReceipt(store, b.receiptId, b.submittedReceipt || null);
    if (result.verified && !before && result.value_released) {
      const receipt = store.receipts.get(b.receiptId);
      const offer = store.offers.get(receipt?.offer_id);
      if (offer) { meterProgramTenant(store, offer.program_id, 'verified_outcomes'); meterProgramTenant(store, offer.program_id, 'outcome_spend', offer.incentive_value); }
    }
    return sendSave(res, 200, result);
  }
  if (method === 'POST' && p === '/api/dispute') {
    const b = await readJson(req);
    return sendSave(res, 200, disputeReceipt(store, b.receiptId));
  }

  // ---- DUAL sync lane ----
  if (method === 'GET' && p.startsWith('/api/dual/prepare/')) {
    return send(res, 200, prepareDualPayload(store, p.split('/')[4]));
  }
  if (method === 'POST' && p === '/api/dual/queue') {
    if (!isAuthorized(req, store)) return send(res, 401, authRequired());
    const b = await readJson(req);
    return sendSave(res, 200, queueDualSync(store, b.receiptId));
  }
  if (method === 'POST' && /^\/api\/dual\/execute\/[^/]+$/.test(p)) {
    const b = await readJson(req);
    const result = executeDualSync(store, p.split('/')[4], {
      operatorTokenHeader: req.headers['x-offermesh-operator-token'],
      executeFlag: b.execute_live_dual_write === true
    });
    save();
    return send(res, result.status === 'operator_auth_required' ? 401 : 200, result);
  }

  return send(res, 404, { error: 'not_found' });
}

function meterProgramTenant(store, programId, metric, amount = 1) {
  const program = store.programs.get(programId);
  if (program?.tenant_id) meter(store, program.tenant_id, metric, amount);
}

function authRequired() {
  return { status: 'agent_auth_required', detail: 'Verified per-tenant gateway key required (x-offermesh-gateway-key). Fails closed. No state changed.' };
}
function tenantAuthRequired() {
  return { status: 'tenant_auth_required', detail: 'Tenant API key required (x-offermesh-tenant-key). Keys are issued by the admin plane and stored only as hashes.' };
}

function guard(res, fn) {
  try { return fn(); }
  catch (err) {
    if (err instanceof RedemptionError || err instanceof OfferError || err instanceof TenantError || err.name === 'FsmError' || err.name === 'ValidationError') {
      return send(res, 422, { status: 'blocked', code: err.code || err.message, reasons: err.reasons || [] });
    }
    throw err;
  }
}

// ---- validation helpers ----
function str(v, max) {
  if (typeof v !== 'string' || v.length === 0 || v.length > max) throw valErr(`string_invalid_max_${max}`);
  return v;
}
function num(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw valErr(`number_out_of_range`);
  return n;
}
function valErr(code) { const e = new Error(code); e.name = 'ValidationError'; e.code = code; return e; }

function setSecurityHeaders(res) {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('strict-transport-security', 'max-age=63072000; includeSubDomains');
  res.setHeader('content-security-policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'");
  res.setHeader('cache-control', 'no-store');
}

async function serveStatic(req, res, url) {
  const path = url.pathname === '/' ? '/index.html' : url.pathname;
  if (path.includes('..')) return send(res, 400, { error: 'bad_path' });
  try {
    const file = await readFile(join(__dirname, 'public', path));
    const type = path.endsWith('.html') ? 'text/html' : path.endsWith('.css') ? 'text/css' : path.endsWith('.js') || path.endsWith('.mjs') ? 'text/javascript' : 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    res.end(file);
  } catch {
    send(res, 404, { error: 'not_found' });
  }
}

function send(res, code, obj) {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(obj));
}
function sendSave(res, code, obj) { save(); return send(res, code, obj); }

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 256 * 1024) { reject(new Error('payload_too_large')); req.destroy(); return; }
      data += chunk;
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { reject(new Error('invalid_json')); }
    });
    req.on('error', reject);
  });
}

export { logEvent };
