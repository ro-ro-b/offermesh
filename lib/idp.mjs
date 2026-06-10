// Bring-your-own OIDC verifier. Uses Node built-ins only and fails closed.
import { createPublicKey, createVerify } from 'node:crypto';

let jwksCache = { url: null, fetched_at: 0, keys: [] };

export function oidcConfig() {
  const issuer = process.env.OFFERMESH_OIDC_ISSUER || '';
  const audience = process.env.OFFERMESH_OIDC_AUDIENCE || '';
  const jwksUrl = process.env.OFFERMESH_OIDC_JWKS_URL || '';
  return {
    bound: Boolean(issuer && audience && jwksUrl),
    issuer,
    audience,
    jwksUrl,
    tenantClaim: process.env.OFFERMESH_OIDC_TENANT_CLAIM || 'tenant_id',
    rolesClaim: process.env.OFFERMESH_OIDC_ROLES_CLAIM || 'roles'
  };
}

export function oidcStatus() {
  const cfg = oidcConfig();
  return {
    implementation_state: cfg.bound ? 'oidc_configured_fail_closed' : 'not_bound',
    provider: 'bring_your_own_oidc',
    issuer_configured: Boolean(cfg.issuer),
    audience_configured: Boolean(cfg.audience),
    jwks_configured: Boolean(cfg.jwksUrl),
    required_claims: ['sub', 'email', cfg.tenantClaim, cfg.rolesClaim],
    fail_closed: true
  };
}

export async function resolveOidcSession(store, req, requiredRole = 'member') {
  const cfg = oidcConfig();
  if (!cfg.bound) return { ok: false, status: 'idp_not_bound', httpStatus: 401 };
  const auth = req.headers.authorization || req.headers.Authorization || '';
  const token = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return { ok: false, status: 'idp_auth_required', httpStatus: 401 };

  const verified = await verifyOidcToken(token, cfg);
  if (!verified.ok) return verified;

  const tenantRef = verified.claims[cfg.tenantClaim];
  const tenant = findTenant(store, tenantRef);
  if (!tenant) return { ok: false, status: 'idp_tenant_not_found', httpStatus: 403 };
  if (tenant.status !== 'active') return { ok: false, status: 'tenant_suspended', httpStatus: 403 };

  const roles = normalizeRoles(verified.claims[cfg.rolesClaim]);
  if (requiredRole && !hasRole(roles, requiredRole)) {
    return { ok: false, status: 'idp_role_required', required_role: requiredRole, httpStatus: 403 };
  }
  return {
    ok: true,
    tenant,
    auth_type: 'oidc',
    subject: String(verified.claims.sub || ''),
    email: String(verified.claims.email || ''),
    roles
  };
}

async function verifyOidcToken(token, cfg) {
  const parsed = parseJwt(token);
  if (!parsed.ok) return parsed;
  const { header, payload, signingInput, signature } = parsed;
  if (header.alg !== 'RS256') return { ok: false, status: 'idp_alg_unsupported', httpStatus: 401 };
  if (payload.iss !== cfg.issuer) return { ok: false, status: 'idp_issuer_mismatch', httpStatus: 401 };
  if (!audMatches(payload.aud, cfg.audience)) return { ok: false, status: 'idp_audience_mismatch', httpStatus: 401 };
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && Number(payload.exp) < now - 30) return { ok: false, status: 'idp_token_expired', httpStatus: 401 };
  if (payload.nbf && Number(payload.nbf) > now + 30) return { ok: false, status: 'idp_token_not_yet_valid', httpStatus: 401 };
  if (!payload.sub || !payload.email || !payload[cfg.tenantClaim]) return { ok: false, status: 'idp_required_claim_missing', httpStatus: 401 };

  const key = await findJwk(cfg.jwksUrl, header.kid);
  if (!key) return { ok: false, status: 'idp_jwk_not_found', httpStatus: 401 };
  try {
    const publicKey = createPublicKey({ key, format: 'jwk' });
    const verifier = createVerify('RSA-SHA256');
    verifier.update(signingInput);
    verifier.end();
    if (!verifier.verify(publicKey, signature)) return { ok: false, status: 'idp_signature_invalid', httpStatus: 401 };
  } catch {
    return { ok: false, status: 'idp_signature_invalid', httpStatus: 401 };
  }
  return { ok: true, claims: payload };
}

function parseJwt(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, status: 'idp_token_malformed', httpStatus: 401 };
  try {
    return {
      ok: true,
      header: JSON.parse(base64url(parts[0]).toString('utf8')),
      payload: JSON.parse(base64url(parts[1]).toString('utf8')),
      signingInput: `${parts[0]}.${parts[1]}`,
      signature: base64url(parts[2])
    };
  } catch {
    return { ok: false, status: 'idp_token_malformed', httpStatus: 401 };
  }
}

async function findJwk(jwksUrl, kid) {
  const age = Date.now() - jwksCache.fetched_at;
  if (jwksCache.url !== jwksUrl || age > 5 * 60 * 1000) {
    const res = await fetch(jwksUrl);
    if (!res.ok) return null;
    const body = await res.json();
    jwksCache = { url: jwksUrl, fetched_at: Date.now(), keys: Array.isArray(body.keys) ? body.keys : [] };
  }
  return jwksCache.keys.find((k) => !kid || k.kid === kid) || null;
}

function base64url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  return Buffer.from(padded, 'base64');
}

function audMatches(aud, expected) {
  return Array.isArray(aud) ? aud.includes(expected) : aud === expected;
}

function normalizeRoles(value) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') return value.split(/[,\s]+/).filter(Boolean);
  return [];
}

function hasRole(roles, requiredRole) {
  if (roles.includes('admin') || roles.includes('owner')) return true;
  if (requiredRole === 'member') return roles.includes('member') || roles.includes('operator');
  return roles.includes(requiredRole);
}

function findTenant(store, tenantRef) {
  if (!tenantRef) return null;
  return store.tenants.get(String(tenantRef)) ||
    [...store.tenants.values()].find((t) => t.slug === String(tenantRef) || t.name === String(tenantRef)) ||
    null;
}
