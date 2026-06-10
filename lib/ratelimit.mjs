// Rate limiting — token bucket per (client, class). Per-instance in serverless (disclosed in readiness);
// a Redis-backed global limiter is the documented next hardening step.
const buckets = new Map();

const LIMITS = {
  read: { capacity: 240, refillPerSec: 4 },    // public reads
  write: { capacity: 60, refillPerSec: 1 },    // agent/console writes
  admin: { capacity: 30, refillPerSec: 0.5 },  // admin ops
  mcp: { capacity: 120, refillPerSec: 2 }      // MCP calls
};

export function rateLimit(req, cls) {
  const limit = LIMITS[cls] || LIMITS.read;
  const client = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const key = `${cls}:${client}`;
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) { bucket = { tokens: limit.capacity, last: now }; buckets.set(key, bucket); }
  bucket.tokens = Math.min(limit.capacity, bucket.tokens + ((now - bucket.last) / 1000) * limit.refillPerSec);
  bucket.last = now;
  if (bucket.tokens < 1) return { allowed: false, retry_after_seconds: Math.ceil((1 - bucket.tokens) / limit.refillPerSec) };
  bucket.tokens -= 1;
  if (buckets.size > 50000) buckets.clear(); // memory guard
  return { allowed: true };
}
