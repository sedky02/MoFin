# MoFin — Repository Technical Audit

**Date:** 2026-09-13
**Scope:** entire repository — `backend/` (NestJS + Prisma + Postgres) and `frontend/web/` (Next.js 16 BFF + React 19)
**Commit audited:** `5fc393e` (branch `main`, clean tree)
**Method:** static reading of every source, config, schema, migration and test file, tracing flows across frontend → BFF → backend → database. The application was **not executed** and no tests were run; findings marked *(uncertain)* were not verified at runtime.

---

## The blunt verdict

This is a well-structured hobby/portfolio codebase with genuinely good instincts — a real ledger model with `Decimal(18,4)`, Zod validation shared between the HTTP and MCP paths, a token-free browser (httpOnly cookies behind a BFF), a hand-rolled but mostly correct OAuth 2.1 authorization server with PKCE, refresh-token rotation and reuse detection. Somebody clearly thought about this.

It is **not production-ready**, and a senior team taking it over would stop on three things before discussing anything else:

1. **A cross-user token leak in the BFF proxy.** A module-level variable shared by all concurrent requests can hand user A's access *and* refresh tokens to user B's browser. That is silent, total account takeover, and it gets *more* likely as traffic grows.
2. **The live `.env` signs JWTs with the literal string `replace-me-access`**, while pointing at a hosted Neon database and exposing the backend through a public ngrok tunnel. Anyone who reads the repo's `.env.example` can mint a valid token for any user id.
3. **The product's headline safety feature does not work.** The draft review form lets the user correct the AI's amount, date, account and category, sends those corrections to `PATCH /draft-transactions/:id/approve` — and the backend ignores the request body entirely and commits the original machine-guessed values to the ledger. Silently. In a finance app.

Beneath that: there is no Dockerfile, no CI, no health check, no graceful shutdown, no error reporting, no error boundaries in the UI, no integration tests, and not a single test proving that user A cannot read user B's data. Rate limiting exists but is architecturally inert, because every request reaches the backend from one IP (the BFF). Balances are computed by loading every ledger row a user has ever written into Node memory and summing in JavaScript.

Nothing here is unfixable. Most of it is a focused two-to-three week effort. But the gap between "works on my machine with one user" and "safe for other people's money" is where this project currently sits.

---

## Top 10 problems to fix first

| # | ID | Severity | Problem |
|---|-----|----------|---------|
| 1 | **SEC-01** | CRITICAL | Shared in-flight refresh promise in the BFF proxy leaks one user's tokens to another user's browser |
| 2 | **SEC-02** | CRITICAL | Placeholder JWT signing secrets (`replace-me-*`) in the live `.env` behind a public tunnel; validation only checks length ≥ 16 |
| 3 | **DATA-01** | CRITICAL | Draft approval silently discards the user's corrections and records the AI's original guess |
| 4 | **SEC-03** | HIGH | MCP OAuth tokens (`scope=mcp`) are accepted by every first-party REST endpoint — the connector has full account access, including minting API keys |
| 5 | **SEC-04** | HIGH | `approve_draft_transaction` is an MCP tool: the AI can approve its own drafts, defeating the entire human-in-the-loop model |
| 6 | **DATA-02** | HIGH | Recurring-transaction cron is non-atomic — a crash between "create occurrence" and "advance nextOccurrenceAt" duplicates real money entries |
| 7 | **SEC-05** | HIGH | Stateless 30-day refresh tokens with no revocation: logout clears a cookie but the stolen token keeps working for a month |
| 8 | **REL-01** | HIGH | Rate limiting is inert (in-memory store, and all traffic arrives from the BFF's single IP) — brute force is unthrottled per-user while 5 logins/min is shared by the whole app |
| 9 | **PERF-01** | HIGH | `getBalance` and goal progress load every `TransactionItem` row into Node and sum in JS — the dashboard's hottest path degrades linearly forever |
| 10 | **DATA-03** | HIGH | Split transactions display only their first line item as the amount everywhere in the UI |

Full list with evidence and fixes: [`02-FINDINGS.md`](02-FINDINGS.md).

---

## Production-readiness scorecard

| Dimension | Score | Justification |
|---|---|---|
| **Security** | **2 / 10** | One cross-user token-leak path, placeholder signing secrets in the live environment, MCP scope escalation to full REST access, no token revocation, inert rate limiting. The OAuth server itself is competently built, which makes the surrounding gaps more jarring, not less. |
| **Reliability** | **3 / 10** | Two multi-step money operations (draft approval, recurring generation) have no transaction boundary and no idempotency. No timeouts on any outbound call. Cron jobs assume a single replica. Errors are swallowed in the server prefetch path and rendered as "$0 / USD". |
| **Performance** | **4 / 10** | Correct for a single user with hundreds of rows; the balance and goal-progress paths are unbounded in-memory aggregations, search is an unindexed `ILIKE '%…%'`, and the goals list is an N+1 over full table scans. Nothing is paginated by a real cursor and no endpoint returns a total count. |
| **Maintainability** | **6 / 10** | Genuinely the strongest dimension: clear module boundaries, DTOs co-located, Zod as one source of truth for HTTP+MCP+Swagger, thoughtful comments explaining *why*. Undermined by hand-written frontend types that silently disagree with the backend, dead modules (budgets, notifications), and a stub masquerading as the AI layer. |
| **Observability** | **2 / 10** | One interceptor that logs method, path and duration on success only. No request ids, no user context, no error logging, no metrics, no tracing, no error reporting service, no health endpoint. Debugging a production incident here means reading raw stdout and guessing. |
| **Testing** | **2 / 10** | 746 lines of pure-function unit tests with hand-rolled mocks (`{} as never`), covering status evaluation and ledger entry shaping. Zero integration tests, zero database tests, zero HTTP tests, zero frontend tests, and — critically for a multi-tenant finance app — **zero tests that user A cannot read user B's data**. The only e2e test is the unmodified Nest scaffold asserting `"Hello World!"`. |
| **Deployment** | **1 / 10** | No Dockerfile, no CI/CD, no infrastructure definition, no health check, no graceful shutdown (`enableShutdownHooks()` is never called), no environment separation. `start:prod` runs `prisma migrate deploy` inline, so every replica races to migrate on boot. Swagger is served publicly at `/docs` with no guard. |

**Overall: not deployable to real users as-is.** With SEC-01, SEC-02, SEC-03, DATA-01 and DATA-02 fixed and a minimal Docker/CI/health-check layer added, it becomes defensible for a small private beta.

---

## Reading order

| File | Contents |
|---|---|
| [`01-ARCHITECTURE.md`](01-ARCHITECTURE.md) | How the system actually works: architecture, data flows, technology assessment |
| [`02-FINDINGS.md`](02-FINDINGS.md) | Every finding, prioritized, with location, evidence, impact and fix |
| [`03-SECURITY.md`](03-SECURITY.md) | Security findings isolated, each with a concrete attack scenario |
| [`04-CROSS-CUTTING.md`](04-CROSS-CUTTING.md) | Problems only visible when looking at the whole system at once |
| [`05-ROADMAP.md`](05-ROADMAP.md) | Fix order, technical-debt triage, and what to deliberately leave alone |
