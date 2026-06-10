// DUAL sync lane — prepare/queue/execute pattern, mirrored from Proof Capsule's named path.
// TRUTHFUL BOUNDARY: this build has no DUAL template/object mapping and no credentials.
// Execution is operator-gated and, even when fully authorized, returns mapping_pending —
// it never fabricates a live write. Wiring a real write requires: production template/object
// creation (operator-approved), server-side credentials, and explicit per-write approval.
import { timingSafeEqual } from 'node:crypto';
import { newId, sha256, logEvent } from './store.mjs';

export function prepareDualPayload(store, receiptId) {
  const receipt = store.receipts.get(receiptId);
  if (!receipt) return { status: 'receipt_not_found' };
  const offer = store.offers.get(receipt.offer_id);
  return {
    status: 'payload_preview_ready',
    write_executed: false,
    mapping_pending: true,
    target: {
      network: 'mainnet',
      org: '6a1a927534603174374c8ecf', // Dual Labs — intended home; no binding exists
      template_id: null,
      object_id: null
    },
    payload: {
      action: 'update',
      public_state: {
        capsule_kind: 'offermesh_redemption_proof',
        offer_id: receipt.offer_id,
        offer_state: offer?.state ?? 'unknown',
        receipt_hash: receipt.receipt_hash,
        terms_hash: receipt.terms_hash,
        agent_id_hash: receipt.agent_id_hash,
        verified: receipt.verified,
        sponsored_disclosure: true
      }
    },
    payload_hash: sha256({ receipt_hash: receipt.receipt_hash, terms_hash: receipt.terms_hash }),
    note: 'Read-only preview. No live DUAL write occurred or can occur in this build.'
  };
}

export function queueDualSync(store, receiptId) {
  const receipt = store.receipts.get(receiptId);
  if (!receipt) return { status: 'receipt_not_found' };
  if (!receipt.verified) return { status: 'blocked', reason: 'receipt_not_verified', note: 'Only verified outcomes are eligible for DUAL anchoring.' };
  const entry = {
    id: newId('dq'),
    receipt_id: receiptId,
    payload_hash: prepareDualPayload(store, receiptId).payload_hash,
    status: 'queued_operator_approval_required',
    queued_at: new Date().toISOString(),
    executed: false
  };
  store.dualQueue.set(entry.id, entry);
  logEvent(store, 'dual-sync-queued', entry.id, entry.status, { receipt_id: receiptId });
  return { status: 'queued', queue_id: entry.id, next: 'operator must call execute with operator token and execute_live_dual_write=true' };
}

export function executeDualSync(store, queueId, { operatorTokenHeader, executeFlag }) {
  const entry = store.dualQueue.get(queueId);
  if (!entry) return { status: 'queue_entry_not_found' };

  const expected = process.env.OFFERMESH_OPERATOR_TOKEN || '';
  if (!expected) {
    return { status: 'operator_auth_required', detail: 'No operator token configured. Lane is fail-closed. No write occurred.' };
  }
  const got = operatorTokenHeader || '';
  const authed = typeof got === 'string' && got.length === expected.length && safeEqual(got, expected);
  if (!authed) {
    return { status: 'operator_auth_required', detail: 'Operator token missing or invalid. No write occurred.' };
  }
  if (executeFlag !== true) {
    return { status: 'explicit_execute_flag_required', detail: 'Set execute_live_dual_write=true to proceed. No write occurred.' };
  }
  // Fully authorized — and still truthful: there is no template/object mapping or credential in this build.
  entry.status = 'blocked_mapping_pending';
  logEvent(store, 'dual-sync-blocked', entry.id, entry.status, { reason: 'no_production_template_object_mapping' });
  return {
    status: 'blocked_mapping_pending',
    write_executed: false,
    detail: 'Operator authorization verified, but no production DUAL template/object mapping or server-side credential exists in this build. Live write intentionally not executed. Create the mapping with explicit approval to enable this lane.'
  };
}

function safeEqual(a, b) {
  try { return timingSafeEqual(Buffer.from(a), Buffer.from(b)); } catch { return false; }
}
