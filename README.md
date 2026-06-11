# Revolv — SmartNFT Offer Network (OfferMesh engine, v0.10.0)

Revolv is the market-facing SmartNFT offer network replacing adverts in agent-mediated commerce. Brands mint verifiable, incentive-carrying offer tokens with escrowed budgets; AI agents discover, evaluate, reserve, and redeem them under scoped mandates (Agent Mandates pattern); an independent verifier issues proof receipts; brands pay **per verified outcome**, not per impression.

OfferMesh is retained as the underlying SaaS/protocol engine: tenant workspaces, gateway keys, MCP tools, proof receipts, metering, readiness, and DUAL sync posture. The repo, URL, and `x-offermesh-*` headers remain stable compatibility surfaces until Ian decides whether to rename the repo/domain.

Built per `plans/sad-2026-06-10-smartnft-agentic-offer-exchange.md` (all 4 sprint scopes, local proof-first). Concept: `wiki/concepts/agentic-offer-exchange.md`.

## Run

```bash
OFFERMESH_GATEWAY_KEY=demo-gateway-key npm start   # http://127.0.0.1:4310/revolv — UI + REST + MCP at /mcp
npm run test:all    # check + smoke + MCP smoke + persistence smoke
```

Optional env: `OFFERMESH_ADMIN_TOKEN` (admin plane; fail-closed when unset), `OFFERMESH_DEMO_CONSOLE_KEY` (demo workspace console key), `KV_REST_API_URL`/`KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` (Upstash Redis durable storage), `OFFERMESH_OPERATOR_TOKEN` (enables the operator step of the DUAL sync lane — still mapping-pending, never writes), `OFFERMESH_STATE_PATH` (persistence location, default `data/state.json`), `OFFERMESH_EPHEMERAL=1` (no persistence), `REVOLV_PUBLIC_URL`, `REVOLV_ALIAS_PUBLIC=1`, `OFFERMESH_OIDC_ISSUER`, `OFFERMESH_OIDC_AUDIENCE`, `OFFERMESH_OIDC_JWKS_URL`, `OFFERMESH_STORAGE_CONCURRENCY_MODE=kv_optimistic_lock`, `OFFERMESH_ALERT_*`, and non-secret `REVOLV_BROAD_COWORK_*` review-evidence env for exact-version/exact-commit production/partner claim posture.

## v0.10.0 — production-readiness next-step hardening

This pass implements the source-side next steps after the v0.9.0 partner-pilot review:

- `/api/ops/customer-session-drill` now returns replayable two-tenant customer-session evidence, not only a checklist. The drill uses scratch state, creates two independent tenant console/gateway sessions, proves same-tenant writes, blocks cross-tenant offer mint/program mutation with 403-style evidence, and returns sanitized hashes only.
- Upstash Redis storage can now run with `OFFERMESH_STORAGE_CONCURRENCY_MODE=kv_optimistic_lock`, which adds a Redis lock plus revision compare-and-set. That prevents silent cross-instance last-writer-wins overwrites when the env is enabled.
- Broad Cowork evidence is now exact-build gated by version and, when Vercel exposes it, commit hash. A changed deployment cannot inherit the v0.9.0 review pass.
- The production smoke harness now supports both pre-review and post-review partner-ready states and checks partner-hardening consistently.

This makes v0.10.0 a production-hardening candidate, not a new partner-ready or production-ready claim. Fresh external Claude Cowork review is required before any v0.10.0 partner-ready, production-ready, or broad `9.8/10` wording. OIDC provider binding, external alerting, alias/custom domain, and DUAL readback mapping remain separate gates unless explicitly configured and reviewed.

## v0.9.0 — partner-pilot 9.8 candidate proof

This pass adds replayable partner-pilot proof evidence over the exact v0.8.0 UI. `/api/ops/partner-pilot-proof` and MCP `get_partner_pilot_proof` run a scratch proof harness that demonstrates two-tenant hashed-key isolation, brand offer creation, agent reserve/redeem under a mandate, verifier-approved receipt release, tamper rejection, sponsored-offer opt-out, per-verified-outcome reporting, DUAL preview without writes, and payment/live-write exclusions. The proof returns sanitized evidence only and does not mutate production customer state.

External Claude Cowork returned a 9.8/10 PASS for the exact v0.9.0 bounded partner-ready scoped-pilot gate. That pass allows only the scoped v0.9.0 wording: partner-ready for scoped production pilots with exclusions for live DUAL writes, payment capture, wallet movement, public writes, provider-created accounts, and real settlement. It is not a broad production-ready, production-grade, full-SaaS, live-DUAL, payment, wallet, settlement, or broad `9.8 product` claim.

## v0.8.0 — exact supplied UI package

This pass implements `/Users/ibuswell/Downloads/revolve.zip` as the visible Revolv UI: the supplied DUAL/Revolv marketing nav, large serif hero, five-step lifecycle, role illustration cards, dashboard-style console, demo runner, marketplace table, create-offer wizard, mandate controls, proof-room card, readiness rail, DUAL logos, illustration assets, and design-system CSS. The React/Babel browser runtime is self-hosted under `public/vendor/` so the page remains compatible with the existing app CSP and does not rely on external script CDNs.

Claim boundaries are unchanged: no live DUAL writes, no public writes, no payment capture, no wallet movement, no real settlement, and no partner-ready/production-ready language until broad external Cowork review passes for the exact deployed build.

## v0.7.0 — partner command-centre UI

This pass supercharges the partner-facing UI: a first-viewport Create Offer command centre, live offer lifecycle rail, proof room hero, role-based views for brand / agent platform / buyer / verifier / operator, visual partner demo story mode, richer agent marketplace cards, brand dashboard cards, and a partner-readiness rail. Raw payloads remain available for review, but the default experience is now card-first and action-led.

Claim boundaries are unchanged: no live DUAL writes, no public writes, no payment capture, no wallet movement, no real settlement, and no partner-ready/production-ready language until broad external Cowork review passes for the exact deployed build.

## v0.6.0 — partner product supercharge

This pass turns the proof console into a partner-pilot product surface: guided Create Offer, one-click partner demo mode, shareable proof rooms, brand dashboard, agent marketplace, reference-agent guide, and partner-hardening evidence. Claim boundaries are unchanged: no live DUAL writes, no public writes, no payment capture, no wallet movement, no real settlement, and no partner-ready/production-ready language until broad external Cowork review passes.

## v0.5.3 — partner story and UX pass

This pass adds a first-read partner story layer above the proof console: who uses Revolv, the five-step offer loop, what a partner can test today, and what remains explicitly excluded. The existing proof controls stay available underneath as the evidence console.

## v0.5.2 — partner-ready claim lane

This pass separates full production readiness from partner-ready pilot readiness. Full production-ready remains blocked until every production item is done, including alias/domain, OIDC browser login, two-browser isolation, fine-grained concurrency, alerting, and DUAL readback mapping if that claim includes live DUAL. A narrower partner-ready pilot claim can become true only when the exact deployed current build has a broad external Claude Cowork pass recorded in non-secret `REVOLV_BROAD_COWORK_*` evidence and the hosted monitor/durable tenant control plane are green. Even then, the allowed claim must keep live DUAL writes, payment capture, wallet movement, public writes, provider-created accounts, and real settlement explicitly excluded.

## v0.5.1 — DUAL UI/UX standard pass

This pass applies the DUAL product-shell standard used by Tokenisation Studio: light DUAL chrome, sticky topbar, segmented workflow navigation, proof/status rails, compact cards, and explicit write/readiness boundaries. It is a UI/UX release over the same v0.5 production-readiness contract.

## v0.5.0 — production-readiness tranche

This tranche reconciles the external Cowork result without inflating it: Revolv v0.4.0 received a scoped 9.8/10 Cowork pass for the next-six consolidation, but v0.5.x still needs a fresh broad production/partner-ready review after deployment.

New production-readiness surfaces:

- `/api/ops/production-readiness` — current production-pilot blockers and broad-readiness gate state.
- `/api/product/public-identity` — canonical public URL, protected alias state, repo, route contract.
- `/api/ops/customer-session-drill` — two-tenant browser/session isolation evidence checklist.
- `/api/ops/incident-runbook` — monitors, fail-closed paths, rollback boundary, alerting status.
- `/api/auth/session` — BYO OIDC bearer-session check; fails closed unless issuer/audience/JWKS env is configured.

OIDC support is provider-ready but not provider-created by the app: configure issuer, audience, and JWKS URL from Auth0/Clerk/WorkOS, ensure tokens include `tenant_id` and `roles`, then run the two-browser tenant isolation drill before any production-ready claim. Payment capture and live DUAL writes remain separate approval gates.

Production claim boundary: v0.10.0 is a production-hardening candidate only after hosted checks pass. Do not call it production-ready, partner-ready, or 9.8/10 until the exact deployed v0.10.0 commit receives a fresh broad external Cowork pass.

## v0.4.0 — all-six next step surface

The canonical public route now works at `/revolv` as well as `/`, so Revolv can be shared from the existing public `offermesh.vercel.app` host while the repo/domain rename remains a separate decision. A `revolv-offers.vercel.app` alias was created but remains Vercel-protected under the project protection policy; do not treat it as the public URL until that protection posture is intentionally changed or a custom domain is attached.

SaaS hardening now exposes a rate-limit mode contract: Upstash Redis fixed-window enforcement when Redis env is configured, local token-bucket fallback otherwise. New REST endpoints: `/api/ops/hardening`, `/api/ops/idp-contract`, `/api/ops/billing-policy`, `/api/dual/live-readback-plan`, and `/api/product/market-pack`. New MCP tools/resources mirror the same artifacts so agents can read the market pack, DUAL plan, and SaaS hardening posture directly.

The old private `ro-ro-b/revolv` MVP is archived as historical. The canonical implementation is this repo: Revolv product over the OfferMesh engine.

## v0.3.1 — Revolv brand merge over the v0.3.0 SaaS layer

Revolv is now the product brand. OfferMesh remains the engine name in API-key headers, MCP compatibility resource URIs, repo continuity, and implementation internals. The readiness scorecard includes `brand_merge=done` to make that boundary explicit.

Multi-tenant brand workspaces with admin-issued API + gateway keys (random, shown once, stored only as sha256 hashes, constant-time compare), tenant-scoped console writes and cross-tenant isolation, suspend/resume/rotate lifecycle, per-tenant monthly usage metering with hashed billing records (per-verified-outcome model; payment processor excluded this phase), durable storage via Upstash Redis REST with optional `kv_optimistic_lock` conflict detection, token-bucket rate limiting (per instance locally, Redis-backed in production), security headers (CSP/nosniff/frame-deny/HSTS), input validation, request IDs, `/api/ops/monitor` health checks, and a truthful `/api/ops/readiness` scorecard that is the ONLY readiness claim this service makes. CI runs the full suite on every push. IdP user login is phase 2; the demo workspace uses public demo keys by design.

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

## MCP surface (POST /mcp, JSON-RPC 2.0 — 27 tools)

`discover_offers` · `get_offer` · `check_eligibility` · `reserve_offer`* · `redeem_offer`* · `get_redemption_receipt` · `verify_receipt` · `get_dual_status` · `simulate_agent_run`* · `get_program_report` · `get_reward_epoch` · `get_proof_events` · `prepare_dual_sync` · `queue_dual_sync`* · `get_revolv_market_pack` · `get_dual_live_readback_plan` · `get_saas_hardening_contract` · `get_public_identity` · `get_production_readiness` · `get_customer_session_drill` · `get_incident_runbook` · `get_agent_marketplace` · `get_brand_dashboard` · `get_proof_room` · `get_reference_agent_guide` · `get_partner_hardening_plan` · `get_partner_pilot_proof` (* = auth-gated, fail closed with `agent_auth_required`).

## DUAL sync lane (prepare → queue → execute)

Mirrors the Proof Capsule named path: payload preview is public read-only; queueing requires a verified gateway key **and** a verified receipt; execution requires an operator token + explicit `execute_live_dual_write=true` — and even then truthfully returns `blocked_mapping_pending` because this build holds no production template/object mapping and no credentials. **A live write is structurally impossible until the mapping is created with explicit operator approval.**

## Boundaries / status

Live demo at https://offermesh.vercel.app/revolv (repo: ro-ro-b/offermesh). No live DUAL writes, no payment processing, no PII in public state. Readiness claims live at `/api/ops/readiness`, `/api/ops/production-readiness`, `/api/ops/partner-pilot-proof`, and `/api/ops/customer-session-drill`. The v0.9.0 partner-ready scoped-pilot Cowork pass is recorded for that exact build; v0.10.0 needs its own exact-build review before any refreshed partner-ready, production-ready, or broad `9.8/10` language.
