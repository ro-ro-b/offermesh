// Durable storage adapter. Upstash Redis REST when configured (Vercel Marketplace injects
// KV_REST_API_URL/KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN);
// otherwise null (file/ephemeral fallback handled by caller).
// Concurrency model: whole-snapshot, last-writer-wins, single region — disclosed in /api/ops/readiness.

const SNAPSHOT_KEY = 'offermesh:state:v1';

export function createStorage() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return {
    kind: 'upstash_redis_rest',
    async load() {
      const res = await fetch(`${url}/get/${SNAPSHOT_KEY}`, {
        headers: { authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(`storage_load_failed:${res.status}`);
      const body = await res.json();
      if (!body.result) return null;
      try { return JSON.parse(body.result); } catch { return null; }
    },
    async save(snapshot) {
      const res = await fetch(`${url}/set/${SNAPSHOT_KEY}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(snapshot)
      });
      if (!res.ok) throw new Error(`storage_save_failed:${res.status}`);
      return true;
    },
    async ping() {
      const res = await fetch(`${url}/ping`, { headers: { authorization: `Bearer ${token}` } });
      return res.ok;
    }
  };
}
