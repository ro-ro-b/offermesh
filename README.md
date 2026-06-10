# OfferMesh — SmartNFT Agentic Offer Exchange (v0.2.0)

SmartNFT brand offers replacing adverts in agent-mediated commerce. Brands mint verifiable, incentive-carrying offer tokens with escrowed budgets; AI agents discover, evaluate, reserve, and redeem them under scoped mandates (Agent Mandates pattern); an independent verifier issues proof receipts; brands pay **per verified outcome**, not per impression.

Built per `plans/sad-2026-06-10-smartnft-agentic-offer-exchange.md` (all 4 sprint scopes, local proof-first). Concept: `wiki/concepts/agentic-offer-exchange.md`.

## Run

```bash
OFFERMESH_GATEWAY_KEY=demo-gateway-key npm start   # http://127.0.0.1:4310 — UI + REST + MCP at /mcp
npm run test:all    # check (30) + smoke (38) + MCP smoke (23) + persistence smoke (6)
```

Optional env: `OFFERMESH_OPERATOR_TOKEN` (enables the operator step of the DUAL sync lane — still mapping-pending, never writes), `OFFERMESH_STATE_PATH` (persistence location, default `data/state.json`), `OFFERMESH_EPHEMERAL=1` (no persistence).

## v0.2.0 — the complete application

Six surfaces in one app: **Walkthrough** (90s reviewer script), **Agent** (autonomous run with decision trace + manual step-by-step), **Brand console** (brands, programs, pause/resume, budget top-up, offer minting, per-outcome reports), **Principal** (sign/revoke mandates, sponsored opt-out), **Verifier** (verify/dispute receipts, DUAL payload preview/queue), **Proof & DUAL** (posture, sync queue, proof event log, source review bundle). Plus: JSON state persistence across restarts, per-epoch redemption caps, two-brand seed marketplace, and an autonomous agent simulator whose `no_offers_within_principal_policy` outcome demonstrates that machine-readable sponsorship disclosure makes principal opt-out enforceable.

## What it proves

- **Offer lifecycle FSM:** `published → discovered → reserved → redeemed → settled`, with `expired`, `flagged_review`, `clawed_back` branches.
- **Mandate gate:** scope/spend/merchant/expiry checks before any redemption action (scope must match action — Kraken lesson).
- **Fail-closed agent auth:** `reserve_offer`/`redeem_offer` return `agent_auth_required` without a verified gateway key (timing-safe compare; no key configured ⇒ no writes).
- **Redemption integrity:** idempotency keys (same key ⇒ same receipt), anti-replay via unique receipt hashes, per-agent caps, escrow invariant (`available + held + spent == budget`).
- **Verifier red-team:** tampered/fake receipts flag for review — never settle, never release value; disputes claw back.
- **Per-verified-outcome billing:** report shows `impressions_billed: 0` and spend == verified outcomes. Reward epoch is **simulated only** (legal review required before financial rewards).
- **Disclosure-native:** every offer carries `sponsored=true` + public incentive terms (MCP resource `offermesh://disclosure-policy`).
- **Truthful DUAL posture:** `/api/dual/status` — mainnet target, `writeMode=read_only`, `mainnetMappingPending=true`, no credentials stored, **no live DUAL writes**.

## MCP surface (POST /mcp, JSON-RPC 2.0 — 14 tools)

`discover_offers` · `get_offer` · `check_eligibility` · `reserve_offer`* · `redeem_offer`* · `get_redemption_receipt` · `verify_receipt` · `get_dual_status` · `simulate_agent_run`* · `get_program_report` · `get_reward_epoch` · `get_proof_events` · `prepare_dual_sync` · `queue_dual_sync`* (* = auth-gated, fail closed with `agent_auth_required`).

## DUAL sync lane (prepare → queue → execute)

Mirrors the Proof Capsule named path: payload preview is public read-only; queueing requires a verified gateway key **and** a verified receipt; execution requires an operator token + explicit `execute_live_dual_write=true` — and even then truthfully returns `blocked_mapping_pending` because this build holds no production template/object mapping and no credentials. **A live write is structurally impossible until the mapping is created with explicit operator approval.**

## Boundaries / status

Local sandbox demo. No live DUAL write, no public writes, no payments, no PII in public state, no deployment performed. **Ungated draft** — no external Cowork score claimed; gate required before any public/partner showing.
