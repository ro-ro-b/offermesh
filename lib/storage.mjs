// Durable storage adapter. Upstash Redis REST when configured (Vercel Marketplace injects
// KV_REST_API_URL/KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN);
// otherwise null (file/ephemeral fallback handled by caller).
// Concurrency model: whole-snapshot by default. When
// OFFERMESH_STORAGE_CONCURRENCY_MODE=kv_optimistic_lock, saves use a Redis
// lock plus revision compare-and-set to fail closed on cross-instance conflicts.
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

const SNAPSHOT_KEY = 'offermesh:state:v1';
const LOCK_KEY = 'offermesh:state:v1:lock';

export function redisConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ''), token };
}

export function hasRedisConfig() {
  return Boolean(redisConfig());
}

export function storageConcurrencyStatus(store = null) {
  const mode = process.env.OFFERMESH_STORAGE_CONCURRENCY_MODE || store?.remote?.concurrency || 'whole_snapshot_last_writer_wins_single_region';
  const protectedMode = ['kv_optimistic_lock', 'kv_atomic', 'postgres', 'fine_grained'].includes(mode);
  return {
    mode,
    protected: protectedMode,
    fail_closed_on_conflict: mode === 'kv_optimistic_lock',
    detail: protectedMode
      ? mode === 'kv_optimistic_lock'
        ? 'Redis lock plus revision compare-and-set prevents silent cross-instance overwrite.'
        : `Storage concurrency mode asserted by ${mode}.`
      : 'Whole-snapshot last-writer-wins; acceptable only for bounded pilots.'
  };
}

export function createStorage() {
  const config = redisConfig();
  if (!config) return null;
  const { url, token } = config;
  const mode = process.env.OFFERMESH_STORAGE_CONCURRENCY_MODE || 'whole_snapshot_last_writer_wins_single_region';
  const optimisticLock = mode === 'kv_optimistic_lock';
  const command = (args) => redisCommand(url, token, args);
  return {
    kind: 'upstash_redis_rest',
    concurrency: optimisticLock ? 'kv_optimistic_lock' : 'whole_snapshot_last_writer_wins_single_region',
    capabilities: {
      revisioned_snapshot: true,
      optimistic_lock: optimisticLock
    },
    async load() {
      const body = await command(['GET', SNAPSHOT_KEY]);
      if (!body.result) return null;
      try { return JSON.parse(body.result); } catch { return null; }
    },
    async save(snapshot) {
      if (optimisticLock) return saveWithOptimisticLock(command, snapshot);
      await command(['SET', SNAPSHOT_KEY, JSON.stringify(snapshot)]);
      return true;
    },
    async ping() {
      try { await command(['PING']); return true; } catch { return false; }
    }
  };
}

async function saveWithOptimisticLock(command, snapshot) {
  const token = randomUUID();
  let acquired = false;
  for (let i = 0; i < 6 && !acquired; i++) {
    const out = await command(['SET', LOCK_KEY, token, 'NX', 'EX', '10']);
    acquired = out.result === 'OK';
    if (!acquired) await sleep(50 * (i + 1));
  }
  if (!acquired) throw new Error('storage_lock_not_acquired');
  try {
    const currentRaw = await command(['GET', SNAPSHOT_KEY]);
    const current = currentRaw.result ? safeParse(currentRaw.result) : null;
    const currentRevision = Number(current?.revision || 0);
    const baseRevision = Number(snapshot.base_revision || 0);
    if (current && currentRevision > baseRevision) {
      throw new Error(`storage_concurrency_conflict:current_${currentRevision}:base_${baseRevision}`);
    }
    await command(['SET', SNAPSHOT_KEY, JSON.stringify(snapshot)]);
    return true;
  } finally {
    await releaseLock(command, token);
  }
}

async function releaseLock(command, token) {
  try {
    await command([
      'EVAL',
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      '1',
      LOCK_KEY,
      token
    ]);
  } catch {
    // The lock has a short TTL; a failed cleanup must not hide the original save result.
  }
}

async function redisCommand(url, token, args) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(args)
  });
  if (!res.ok) throw new Error(`storage_command_failed:${args[0]}:${res.status}`);
  const body = await res.json();
  if (body?.error) throw new Error(`storage_command_failed:${args[0]}:${body.error}`);
  return body;
}

function safeParse(value) {
  try { return JSON.parse(value); } catch { return null; }
}
