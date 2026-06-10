// OfferMesh app — shared request handler for local server and Vercel serverless adapter.
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore, logEvent, persist, restore } from './store.mjs';
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

const __dirname = join(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '0.2.0';
const STARTED_AT = new Date().toISOString();

const store = createStore();
const statePath = process.env.OFFERMESH_STATE_PATH || join(__dirname, 'data', 'state.json');
const restored = process.env.OFFERMESH_EPHEMERAL === '1' ? false : restore(store, statePath);
let seedInfo = null;
if (!restored || store.programs.size === 0) {
  seedInfo = seed(store);
  save();
} else {
  // rebuild seed-info view from restored state (first program/mandates by created order)
  const programs = [...store.programs.values()];
  const mandates = [...store.mandates.values()];
  seedInfo = {
    program: programs[0], program2: programs[1] || programs[0],
    offers: [...store.offers.values()],
    goodMandate: mandates.find((m) => m.agent_id === 'agent:claude-reference') || mandates[0],
    narrowMandate: mandates.find((m) => m.agent_id === 'agent:narrow-scope') || mandates[0],
    noSponsoredMandate: mandates.find((m) => m.agent_id === 'agent:unsponsored') || mandates[0],
    brands: [...store.brands.values()]
  };
}

function save() { try { persist(store); } catch { /* persistence best-effort */ } }

export async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method === 'POST' && url.pathname === '/mcp') {
      const body = await readJson(req);
      const out = handleMcp(store, body, req);
      save();
      if (out === null) return send(res, 202, {});
      return send(res, 200, out);
    }
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    return serveStatic(req, res, url);
  } catch (err) {
    return send(res, 500, { error: 'internal_error', detail: String(err.message || err) });
  }
}

export const meta = { VERSION, STARTED_AT };

async function api(req, res, url) {
  const p = url.pathname;
  const method = req.method;

  // ---- service status ----
  if (method === 'GET' && p === '/api/status') {
    return send(res, 200, {
      service: 'offermesh', version: VERSION, started_at: STARTED_AT,
      persistence: { enabled: process.env.OFFERMESH_EPHEMERAL !== '1', restored },
      counts: { brands: store.brands.size, programs: store.programs.size, offers: store.offers.size, mandates: store.mandates.size, receipts: store.receipts.size, ledger: store.ledger.length, events: store.events.length },
      gate: { agent_gateway_key_configured: Boolean(process.env.OFFERMESH_GATEWAY_KEY), operator_token_configured: Boolean(process.env.OFFERMESH_OPERATOR_TOKEN) },
      dual: dualStatus()
    });
  }
  if (method === 'GET' && p === '/api/dual/status') return send(res, 200, dualStatus());
  if (method === 'GET' && p === '/api/source/review-bundle') return send(res, 200, sourceReviewBundle(VERSION));

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
    return send(res, 200, {
      program_id: seedInfo.program.id,
      program2_id: seedInfo.program2.id,
      offer_ids: seedInfo.offers.map((o) => o.id),
      good_mandate_id: seedInfo.goodMandate.id,
      narrow_mandate_id: seedInfo.narrowMandate.id,
      no_sponsored_mandate_id: seedInfo.noSponsoredMandate.id,
      brand_ids: seedInfo.brands.map((b) => b.id)
    });
  }

  // ---- brand console (local demo writes) ----
  if (method === 'POST' && p === '/api/brands') {
    const b = await readJson(req);
    return guard(res, () => sendSave(res, 201, createBrand(store, b)));
  }
  if (method === 'POST' && p === '/api/programs') {
    const b = await readJson(req);
    return guard(res, () => sendSave(res, 201, createProgram(store, b)));
  }
  if (method === 'POST' && /^\/api\/programs\/[^/]+\/pause$/.test(p)) {
    return guard(res, () => sendSave(res, 200, pauseProgram(store, p.split('/')[3])));
  }
  if (method === 'POST' && /^\/api\/programs\/[^/]+\/resume$/.test(p)) {
    return guard(res, () => sendSave(res, 200, resumeProgram(store, p.split('/')[3])));
  }
  if (method === 'POST' && /^\/api\/programs\/[^/]+\/topup$/.test(p)) {
    const b = await readJson(req);
    return guard(res, () => sendSave(res, 200, topUpProgram(store, p.split('/')[3], Number(b.amount))));
  }
  if (method === 'POST' && p === '/api/offers') {
    const b = await readJson(req);
    return guard(res, () => sendSave(res, 201, createOffer(store, b.programId, b)));
  }

  // ---- principal cockpit ----
  if (method === 'POST' && p === '/api/mandates') {
    const b = await readJson(req);
    return guard(res, () => sendSave(res, 201, createMandate(store, b)));
  }
  if (method === 'POST' && /^\/api\/mandates\/[^/]+\/revoke$/.test(p)) {
    const m = revokeMandate(store, p.split('/')[3]);
    save();
    return m ? send(res, 200, m) : send(res, 404, { error: 'mandate_not_found' });
  }

  // ---- agent actions ----
  if (method === 'POST' && p === '/api/agent/discover') {
    const b = await readJson(req);
    return guard(res, () => sendSave(res, 200, publicOffer(discoverOffer(store, b.offerId, b.agentId))));
  }
  if (method === 'POST' && p === '/api/agent/eligibility') {
    const b = await readJson(req);
    return guard(res, () => send(res, 200, checkEligibility(store, b)));
  }
  if (method === 'POST' && p === '/api/agent/reserve') {
    if (!isAuthorized(req)) return send(res, 401, authRequired());
    const b = await readJson(req);
    return guard(res, () => sendSave(res, 200, { status: 'reserved', offer: publicOffer(reserveOffer(store, b)) }));
  }
  if (method === 'POST' && p === '/api/agent/redeem') {
    if (!isAuthorized(req)) return send(res, 401, authRequired());
    const b = await readJson(req);
    return guard(res, () => {
      const { receipt, idempotent_replay } = redeemOffer(store, b);
      return sendSave(res, 200, { status: 'redeemed', idempotent_replay, receipt });
    });
  }
  if (method === 'POST' && p === '/api/agent/simulate') {
    if (!isAuthorized(req)) return send(res, 401, authRequired());
    const b = await readJson(req);
    return guard(res, () => sendSave(res, 200, runAgent(store, { mandateId: b.mandateId, agentId: b.agentId, autoVerify: b.autoVerify !== false })));
  }

  // ---- verifier ----
  if (method === 'POST' && p === '/api/verify') {
    const b = await readJson(req);
    return sendSave(res, 200, verifyReceipt(store, b.receiptId, b.submittedReceipt || null));
  }
  if (method === 'POST' && p === '/api/dispute') {
    const b = await readJson(req);
    return sendSave(res, 200, disputeReceipt(store, b.receiptId));
  }

  // ---- DUAL sync lane (prepare = public read, queue = gateway-gated, execute = operator-gated) ----
  if (method === 'GET' && p.startsWith('/api/dual/prepare/')) {
    return send(res, 200, prepareDualPayload(store, p.split('/')[4]));
  }
  if (method === 'POST' && p === '/api/dual/queue') {
    if (!isAuthorized(req)) return send(res, 401, authRequired());
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
    const code = result.status === 'operator_auth_required' ? 401 : 200;
    return send(res, code, result);
  }

  return send(res, 404, { error: 'not_found' });
}

function authRequired() {
  return { status: 'agent_auth_required', detail: 'Verified gateway key required (x-offermesh-gateway-key). Fails closed. No state changed.' };
}

function guard(res, fn) {
  try { return fn(); }
  catch (err) {
    if (err instanceof RedemptionError || err instanceof OfferError || err.name === 'FsmError') {
      return send(res, 422, { status: 'blocked', code: err.code, reasons: err.reasons || [] });
    }
    throw err;
  }
}

async function serveStatic(req, res, url) {
  const path = url.pathname === '/' ? '/index.html' : url.pathname;
  if (path.includes('..')) return send(res, 400, { error: 'bad_path' });
  try {
    const file = await readFile(join(__dirname, 'public', path));
    const type = path.endsWith('.html') ? 'text/html' : path.endsWith('.css') ? 'text/css' : path.endsWith('.js') || path.endsWith('.mjs') ? 'text/javascript' : 'application/octet-stream';
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(file);
  } catch {
    send(res, 404, { error: 'not_found' });
  }
}

function send(res, code, obj) {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
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
