# Revolv — SmartNFT Offer Network (OfferMesh engine, v0.5.0)

Revolv is the market-facing SmartNFT offer network replacing adverts in agent-mediated commerce. Brands mint verifiable, incentive-carrying offer tokens with escrowed budgets; AI agents discover, evaluate, reserve, and redeem them under scoped mandates (Agent Mandates pattern); an independent verifier issues proof receipts; brands pay **per verified outcome**, not per impression.

OfferMesh is retained as the underlying SaaS/protocol engine: tenant workspaces, gateway keys, MCP tools, proof receipts, metering, readiness, and DUAL sync posture. The repo, URL, and `x-offermesh-*` headers remain stable compatibility surfaces until Ian decides whether to rename the repo/domain.

Built per `plans/sad-2026-06-10-smartnft-agentic-offer-exchange.md` (all 4 sprint scopes, local proof-first). Concept: `wiki/concepts/agentic-offer-exchange.md`.

## Run

```bash
OFFERMESH_GATEWAY_KEY=demo-gateway-key npm start   # http://127.0.0.1:4310/revolv — UI + REST + MCP at /mcp
npm run test:all    # check + smoke + MCP smoke + persistence smoke
```

Optional env: `OFFERMESH_ADMIN_TOKEN` (admin plane; fail-closed when unset), `OFFERMESH_DEMO_CONSOLE_KEY` (demo workspace console key), `KV_REST_API_URL`/`KV_REST_API_TOKEN` (Upstash Redis durable storage), `OFFERMESH_OPERATOR_TOKEN` (enables the operator step of the DUAL sync lane — still mapping-pending, never writes), `OFFERMESH_STATE_PATH` (persistence location, default `data/state.json`), `OFFERMESH_EPHEMERAL=1` (no persistence), `REVOLV_PUBLIC_URL`, `REVOLV_ALIAS_PUBLIC=1`, `OFFERMESH_OIDC_ISSUER`, `OFFERMESH_OIDC_AUDIENCE`, `OFFERMESH_OIDC_JWKS_URL`, `OFFERMESH_STORAGE_CONCURRENCY_MODE`, and `OFFERMESH_ALERT_*` for production-readiness posture.

## v0.5.0 — production-readiness tranche

This tranche reconciles the external Cowork result without inflating it: Revolv v0.4.0 received a scoped 9.8/10 Cowork pass for the next-six consolidation, but v0.5.x still needs a fresh broad production/partner-ready review after deployment.

New production-readiness surfaces:

- `/api/ops/production-readiness` — current production-pilot blockers and broad-readiness gate state.
- `/api/product/public-identity` — canonical public URL, protected alias state, repo, route contract.
- `/api/ops/customer-session-drill` — two-tenant browser/session isolation evidence checklist.
- `/api/ops/incident-runbook` — monitors, fail-closed paths, rollback boundary, alerting status.
- `/api/auth/session` — BYO OIDC bearer-session check; fails closed unless issuer/audience/JWKS env is configured.

OIDC support is provider-ready but not provider-created by the app: configure issuer, audience, and JWKS URL from Auth0/Clerk/WorkOS, ensure tokens include `tenant_id` and `roles`, then run the two-browser tenant isolation drill before any production-ready claim. Payment capture and live DUAL writes remain separate approval gates.

Production claim boundary: v0.5.0 can be called a production-readiness tranche or production-pilot candidate only after hosted checks pass. Do not call it production-ready or partner-ready until the exact deployed v0.5.x commit receives a fresh broad external Cowork pass.

## v0.4.0 — all-six next step surface

The canonical public route now works at `/revolv` as well as `/`, so Revolv can be shared from the existing public `offermesh.vercel.app` host while the repo/domain rename remains a separate decision. A `revolv-offers.vercel.app` alias was created but remains Vercel-protected under the project protection policy; do not treat it as the public URL until that protection posture is intentionally changed or a custom domain is attached.

SaaS hardening now exposes a rate-limit mode contract: Upstash Redis fixed-window enforcement when Redis env is configured, local token-bucket fallback otherwise. New REST endpoints: `/api/ops/hardening`, `/api/ops/idp-contract`, `/api/ops/billing-policy`, `/api/dual/live-readback-plan`, and `/api/product/market-pack`. New MCP tools/resources mirror the same artifacts so agents can read the market pack, DUAL plan, and SaaS hardening posture directly.

The old private `ro-ro-b/revolv` MVP is archived as historical. The canonical implementation is this repo: Revolv product over the OfferMesh engine.

## v0.3.1 — Revolv brand merge over the v0.3.0 SaaS layer

Revolv is now the product brand. OfferMesh remains the engine name in API-key headers, MCP compatibility resource URIs, repo continuity, and implementation internals. The readiness scorecard includes `brand_merge=done` to make that boundary explicit.

Multi-tenant brand workspaces with admin-issued API + gateway keys (random, shown once, stored only as sha256 hashes, constant-time compare), tenant-scoped console writes and cross-tenant isolation, suspend/resume/rotate lifecycle, per-tenant monthly usage metering with hashed billing records (per-verified-outcome model; payment processor excluded this phase), durable storage via Upstash Redis REST (whole-snapshot, last-writer-wins — disclosed), token-bucket rate limiting (per instance — disclosed), security headers (CSP/nosniff/frame-deny/HSTS), input validation, request IDs, `/api/ops/monitor` health checks, and a truthful `/api/ops/readiness` scorecard that is the ONLY readiness claim this service makes. CI runs the full suite on every push. IdP user login is phase 2; the demo workspace uses public demo keys by design.

### SaaS surface

Admin (x-offermesh-admin-token): `POST/GET /api/admin/tenants`, `POST .../rotate|suspend|resume`, `GET /api/admin/usage`, `GET /api/admin/billing/:tenant/:month`. Tenant (x-offermesh-tenant-key): `GET /api/tenant/me|usage|billing/:month`, plus all brand-console writes. Agents (x-offermesh-gateway-key, per tenant): reserve/redeem/simulate via REST or MCP.

## v0.2.0 — the complete application

Six surfaces in one app: **Walkthrough** (90s reviewer script), **Agent** (autonomous run with decision trace + manual step-by-step), **Brand console** (brands, programs, pause/resume, budget top-up, offer minting, per-outcome reports), **Principal** (sign/revoke mandates, sponsored opt-out), **Verifier** (verify/dispute receipts, DUAL payload preview/queue), **Proof & DUAL** (posture, sync queue, proof event log, source review bundle). Plus: JSON state persistence across restarts, per-epoch redemption caps, two-brand seed marketplace, and an autonomous agent simulator whose `no_offers_within_principal_policy` outcome demonstrates that machine-readable sponsorship disclosure makes principal opt-out enforceable.

## What it proves

- **Offer lifecycle FSM:** `published → discovered → reserved → redeemed → settled`, with `expired`, `flagged_review`, `clawed_back` branches.
- **Mandate gate:** scope/spend/merchant/expiry checks before any redemption action (scope must match action — Kraken lesson).
- **Fail-closed agent auth:** `reserve_offer`/`redeem_offer` return `agent_auth_required` without a verified gateway key (timing-safe compare; no key configured ⇒ no writes).
- **Redemption integrity:** idempotency keys (same key ⇒ same receipt), anti-replay via unique receipt hashes, per-agent caps, escrow invariant (`available + held + spent == budget`).
- **Verifier red-team:** tampered/fake receipts flag for review — never settle, never release value; disputes claw back.
- **Per-verified-outcome billing:** report shows `impressions_billed: 0` and spend == verified outcomes. Reward epoch is **simulated only** (legal review required before financial rewards).
- **Disclosure-native:** every offer carries `sponsored=true` + public incentive terms (MCP resource `revolv://disclosure-policy`; `offermesh://disclosure-policy` remains supported for compatibility).
- **Truthful DUAL posture:** `/api/dual/status` — mainnet target, `writeMode=read_only`, `mainnetMappingPending=true`, no credentials stored, **no live DUAL writes**.

## MCP surface (POST /mcp, JSON-RPC 2.0 — 21 tools)

`discover_offers` · `get_offer` · `check_eligibility` · `reserve_offer`* · `redeem_offer`* · `get_redemption_receipt` · `verify_receipt` · `get_dual_status` · `simulate_agent_run`* · `get_program_report` · `get_reward_epoch` · `get_proof_events` · `prepare_dual_sync` · `queue_dual_sync`* · `get_revolv_market_pack` · `get_dual_live_readback_plan` · `get_saas_hardening_contract` · `get_public_identity` · `get_production_readiness` · `get_customer_session_drill` · `get_incident_runbook` (* = auth-gated, fail closed with `agent_auth_required`).

## DUAL sync lane (prepare → queue → execute)

Mirrors the Proof Capsule named path: payload preview is public read-only; queueing requires a verified gateway key **and** a verified receipt; execution requires an operator token + explicit `execute_live_dual_write=true` — and even then truthfully returns `blocked_mapping_pending` because this build holds no production template/object mapping and no credentials. **A live write is structurally impossible until the mapping is created with explicit operator approval.**

## Boundaries / status

Live demo at https://offermesh.vercel.app/revolv (repo: ro-ro-b/offermesh). No live DUAL writes, no payment processing, no PII in public state. Readiness claims live at `/api/ops/readiness` and `/api/ops/production-readiness`. The v0.4.0 scoped Cowork pass is recorded, but broad production-ready/partner-ready language remains blocked until the v0.5.x broad review gate passes.
