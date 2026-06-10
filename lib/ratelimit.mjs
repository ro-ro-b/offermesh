// Rate limiting — Upstash Redis fixed window when configured; local token bucket fallback otherwise.
// The mode is disclosed in readiness and /api/ops/hardening.
import { createHash } from 'node:crypto';
import { redisConfig } from './storage.mjs';

const buckets = new Map();

const LIMITS = {
  read: { capacity: 240, refillPerSec: 4 },    // public reads
  write: { capacity: 60, refillPerSec: 1 },    // agent/console writes
  admin: { capacity: 30, refillPerSec: 0.5 },  // admin ops
  mcp: { capacity: 120, refillPerSec: 2 }      // MCP calls
};

export function rateLimitMode() {
  const redis = Boolean(redisConfig());
  return {
    mode: redis ? 'redis_fixed_window' : 'local_token_bucket',
    global: redis,
    window_seconds: 60,
    configured_store: redis ? 'upstash_redis_rest' : 'process_memory'
  };
}

export async function rateLimit(req, cls) {
  const limit = LIMITS[cls] || LIMITS.read;
  const client = clientRef(req);
  const redis = redisConfig();
  if (redis) {
    try {
      const windowSeconds = 60;
      const windowId = Math.floor(Date.now() / (windowSeconds * 1000));
      const key = `offermesh:rl:v1:${cls}:${hash(client)}:${windowId}`;
      const res = await fetch(`${redis.url}/pipeline`, {
        method: 'POST',
        headers: { authorization: `Bearer ${redis.token}`, 'content-type': 'application/json' },
        body: JSON.stringify([['INCR', key], ['EXPIRE', key, windowSeconds + 5]])
      });
      if (!res.ok) throw new Error(`rate_limit_redis_failed:${res.status}`);
      const body = await res.json();
      const count = Number(body?.[0]?.result || 0);
      if (count > limit.capacity) return { allowed: false, retry_after_seconds: secondsUntilWindowEnd(windowSeconds), mode: 'redis_fixed_window' };
      return { allowed: true, mode: 'redis_fixed_window' };
    } catch (err) {
      return localRateLimit(limit, cls, client, { fallback_error: String(err.message || err) });
    }
  }
  return localRateLimit(limit, cls, client);
}

function localRateLimit(limit, cls, client, extra = {}) {
  const key = `${cls}:${client}`;
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) { bucket = { tokens: limit.capacity, last: now }; buckets.set(key, bucket); }
  bucket.tokens = Math.min(limit.capacity, bucket.tokens + ((now - bucket.last) / 1000) * limit.refillPerSec);
  bucket.last = now;
  if (bucket.tokens < 1) return { allowed: false, retry_after_seconds: Math.ceil((1 - bucket.tokens) / limit.refillPerSec) };
  bucket.tokens -= 1;
  if (buckets.size > 50000) buckets.clear(); // memory guard
  return { allowed: true, mode: 'local_token_bucket', ...extra };
}

function clientRef(req) {
  return (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}

function hash(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 24);
}

function secondsUntilWindowEnd(windowSeconds) {
  const now = Math.floor(Date.now() / 1000);
  return Math.max(1, windowSeconds - (now % windowSeconds));
}
