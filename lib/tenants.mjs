// Multi-tenant brand workspaces. Keys are random, shown once at issue time, stored ONLY as sha256 hashes.
// Auth comparisons are constant-time over fixed-length hex hashes.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { newId, sha256, logEvent } from './store.mjs';

export function createTenant(store, { name }) {
  if (!name || typeof name !== 'string' || name.length > 80) throw new TenantError('tenant_name_invalid');
  const apiKey = `omk_${randomBytes(24).toString('hex')}`;       // console/API key (brand operators)
  const gatewayKey = `omg_${randomBytes(24).toString('hex')}`;   // agent gateway key (machine agents)
  const tenant = {
    id: newId('tnt'),
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40),
    api_key_hash: sha256(apiKey),
    gateway_key_hash: sha256(gatewayKey),
    status: 'active',
    created_at: new Date().toISOString()
  };
  store.tenants.set(tenant.id, tenant);
  logEvent(store, 'tenant-created', tenant.id, tenant.status, { name });
  // Raw keys returned exactly once; never persisted.
  return { tenant: publicTenant(tenant), api_key: apiKey, gateway_key: gatewayKey };
}

export function rotateTenantKeys(store, tenantId) {
  const tenant = store.tenants.get(tenantId);
  if (!tenant) throw new TenantError('tenant_not_found');
  const apiKey = `omk_${randomBytes(24).toString('hex')}`;
  const gatewayKey = `omg_${randomBytes(24).toString('hex')}`;
  tenant.api_key_hash = sha256(apiKey);
  tenant.gateway_key_hash = sha256(gatewayKey);
  logEvent(store, 'tenant-keys-rotated', tenant.id, tenant.status);
  return { tenant: publicTenant(tenant), api_key: apiKey, gateway_key: gatewayKey };
}

export function setTenantStatus(store, tenantId, status) {
  const tenant = store.tenants.get(tenantId);
  if (!tenant) throw new TenantError('tenant_not_found');
  if (!['active', 'suspended'].includes(status)) throw new TenantError('status_invalid');
  tenant.status = status;
  logEvent(store, `tenant-${status}`, tenant.id, status);
  return publicTenant(tenant);
}

export function publicTenant(tenant) {
  const { api_key_hash, gateway_key_hash, ...pub } = tenant;
  return { ...pub, api_key_hash_prefix: api_key_hash.slice(0, 14), gateway_key_hash_prefix: gateway_key_hash.slice(0, 14) };
}

// ---- auth resolution ----
function hashMatches(rawKey, storedHash) {
  if (typeof rawKey !== 'string' || rawKey.length < 8 || rawKey.length > 128) return false;
  const candidate = sha256(rawKey);
  try { return timingSafeEqual(Buffer.from(candidate), Buffer.from(storedHash)); } catch { return false; }
}

export function resolveTenantByApiKey(store, rawKey) {
  if (!rawKey) return null;
  for (const tenant of store.tenants.values()) {
    if (hashMatches(rawKey, tenant.api_key_hash)) return tenant.status === 'active' ? tenant : { ...tenant, blocked: true };
  }
  return null;
}

export function resolveTenantByGatewayKey(store, rawKey) {
  if (!rawKey) return null;
  for (const tenant of store.tenants.values()) {
    if (hashMatches(rawKey, tenant.gateway_key_hash)) return tenant.status === 'active' ? tenant : { ...tenant, blocked: true };
  }
  return null;
}

export function isAdmin(req) {
  const expected = process.env.OFFERMESH_ADMIN_TOKEN || '';
  if (!expected) return false; // fail closed
  const got = req.headers['x-offermesh-admin-token'] || '';
  if (typeof got !== 'string' || got.length !== expected.length) return false;
  try { return timingSafeEqual(Buffer.from(got), Buffer.from(expected)); } catch { return false; }
}

export class TenantError extends Error {
  constructor(code) { super(code); this.code = code; this.name = 'TenantError'; }
}
