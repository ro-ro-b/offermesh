// Usage metering — per-tenant, per-month counters. Exportable hashed billing records.
// No payment processor in scope; this is the billing substrate (Stripe excluded per fleet pattern).
import { sha256 } from './store.mjs';

const METRICS = ['programs_created', 'offers_minted', 'redemptions', 'verified_outcomes', 'outcome_spend', 'agent_simulations', 'mcp_calls'];

export function meter(store, tenantId, metric, amount = 1) {
  if (!tenantId || !METRICS.includes(metric)) return;
  const month = new Date().toISOString().slice(0, 7);
  const key = `${tenantId}:${month}`;
  const row = store.usage.get(key) || Object.fromEntries(METRICS.map((m) => [m, 0]));
  row[metric] += amount;
  store.usage.set(key, row);
}

export function tenantUsage(store, tenantId) {
  const months = [];
  for (const [key, row] of store.usage.entries()) {
    if (key.startsWith(tenantId + ':')) months.push({ month: key.split(':')[1], ...row });
  }
  months.sort((a, b) => a.month.localeCompare(b.month));
  return { tenant_id: tenantId, billing_model: 'per_verified_outcome', months };
}

export function billingRecord(store, tenantId, month) {
  const row = store.usage.get(`${tenantId}:${month}`);
  if (!row) return null;
  const record = {
    tenant_id: tenantId,
    month,
    billing_model: 'per_verified_outcome',
    billable_metric: 'verified_outcomes',
    billable_quantity: row.verified_outcomes,
    outcome_spend: row.outcome_spend,
    usage: row,
    generated_at: new Date().toISOString(),
    payment_processor: 'none_excluded_this_phase'
  };
  record.record_hash = sha256(record);
  return record;
}

export function allUsage(store) {
  return [...store.usage.entries()].map(([key, row]) => {
    const [tenant_id, month] = key.split(':');
    return { tenant_id, month, ...row };
  });
}
