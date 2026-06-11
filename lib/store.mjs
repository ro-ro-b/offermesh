// In-memory store with deterministic hashing + JSON file persistence. Local proof-first; no live DUAL writes.
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

export function sha256(value) {
  return '0x' + createHash('sha256').update(typeof value === 'string' ? value : stableStringify(value)).digest('hex');
}

export function stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(obj).sort().map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

export function newId(prefix) {
  return `${prefix}_${randomUUID().slice(0, 13).replace(/-/g, '')}`;
}

const MAP_KEYS = ['brands', 'programs', 'offers', 'mandates', 'receipts', 'idempotency', 'reservations', 'redemptionCounts', 'epochRedemptions', 'dualQueue', 'tenants', 'usage'];
const SET_KEYS = ['receiptHashes'];
const ARR_KEYS = ['ledger', 'events'];

export function createStore() {
  const store = { statePath: null, remote: null, revision: 0 };
  for (const k of MAP_KEYS) store[k] = new Map();
  for (const k of SET_KEYS) store[k] = new Set();
  for (const k of ARR_KEYS) store[k] = [];
  return store;
}

export function snapshot(store) {
  const snap = {};
  for (const k of MAP_KEYS) snap[k] = [...store[k].entries()];
  for (const k of SET_KEYS) snap[k] = [...store[k].values()];
  for (const k of ARR_KEYS) snap[k] = store[k];
  snap.base_revision = Number(store.revision || 0);
  snap.revision = snap.base_revision + 1;
  snap.saved_at = new Date().toISOString();
  return snap;
}

export function loadSnapshot(store, snap) {
  for (const k of MAP_KEYS) store[k] = new Map(snap[k] || []);
  for (const k of SET_KEYS) store[k] = new Set(snap[k] || []);
  for (const k of ARR_KEYS) store[k] = snap[k] || [];
  store.revision = Number(snap.revision || 0);
}

// Remote (Redis) persistence: debounced fire-and-forget with awaitable flush for tests.
let pendingSave = null;
export function persistRemote(store) {
  if (!store.remote) return;
  if (pendingSave) return;
  pendingSave = (async () => {
    await new Promise((r) => setTimeout(r, 150)); // coalesce bursts
    pendingSave = null;
    try {
      const snap = snapshot(store);
      await store.remote.save(snap);
      store.revision = snap.revision;
      store.lastRemoteSave = new Date().toISOString();
      store.lastRemoteError = null;
    }
    catch (err) { store.lastRemoteError = String(err.message || err); }
  })();
}

export async function flushRemote(store) {
  if (pendingSave) await pendingSave;
  if (store.remote) {
    try {
      const snap = snapshot(store);
      await store.remote.save(snap);
      store.revision = snap.revision;
      store.lastRemoteSave = new Date().toISOString();
      store.lastRemoteError = null;
    }
    catch (err) { store.lastRemoteError = String(err.message || err); }
  }
}

export async function restoreRemote(store, remote) {
  store.remote = remote;
  const snap = await remote.load();
  if (snap) { loadSnapshot(store, snap); return true; }
  return false;
}

export function logEvent(store, eventType, objectId, state, payload = {}) {
  const event = {
    event_type: eventType,
    object_id: objectId,
    state,
    timestamp: new Date().toISOString(),
    payload_hash: sha256(payload)
  };
  event.event_hash = sha256(event);
  store.events.push(event);
  return event;
}

// ---- file persistence (local dev) ----
export function persist(store) {
  if (!store.statePath) return false;
  mkdirSync(dirname(store.statePath), { recursive: true });
  const snap = snapshot(store);
  writeFileSync(store.statePath, JSON.stringify(snap));
  store.revision = snap.revision;
  return true;
}

export function restore(store, statePath) {
  store.statePath = statePath;
  if (!existsSync(statePath)) return false;
  try {
    loadSnapshot(store, JSON.parse(readFileSync(statePath, 'utf8')));
    return true;
  } catch {
    return false; // corrupt state file: start fresh rather than crash
  }
}
