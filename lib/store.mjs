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

const MAP_KEYS = ['brands', 'programs', 'offers', 'mandates', 'receipts', 'idempotency', 'reservations', 'redemptionCounts', 'epochRedemptions', 'dualQueue'];
const SET_KEYS = ['receiptHashes'];
const ARR_KEYS = ['ledger', 'events'];

export function createStore() {
  const store = { statePath: null };
  for (const k of MAP_KEYS) store[k] = new Map();
  for (const k of SET_KEYS) store[k] = new Set();
  for (const k of ARR_KEYS) store[k] = [];
  return store;
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

// ---- persistence ----
export function persist(store) {
  if (!store.statePath) return false;
  const snapshot = {};
  for (const k of MAP_KEYS) snapshot[k] = [...store[k].entries()];
  for (const k of SET_KEYS) snapshot[k] = [...store[k].values()];
  for (const k of ARR_KEYS) snapshot[k] = store[k];
  snapshot.saved_at = new Date().toISOString();
  mkdirSync(dirname(store.statePath), { recursive: true });
  writeFileSync(store.statePath, JSON.stringify(snapshot));
  return true;
}

export function restore(store, statePath) {
  store.statePath = statePath;
  if (!existsSync(statePath)) return false;
  try {
    const snapshot = JSON.parse(readFileSync(statePath, 'utf8'));
    for (const k of MAP_KEYS) store[k] = new Map(snapshot[k] || []);
    for (const k of SET_KEYS) store[k] = new Set(snapshot[k] || []);
    for (const k of ARR_KEYS) store[k] = snapshot[k] || [];
    return true;
  } catch {
    return false; // corrupt state file: start fresh rather than crash
  }
}
