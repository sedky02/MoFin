# Phase 1 — How MoFin Actually Works

## 1. Architecture overview

MoFin is two deployables plus a database:

```
Browser ──cookies──> Next.js 16 (port 3001)          NestJS (port 3000)            Postgres
                     ├─ proxy.ts (route gate)         ├─ /api/v1/* REST  ──Prisma──> mofin
                     ├─ /api/auth/*  (BFF auth)  ───> ├─ /api/v1/auth/*
                     └─ /api/backend/[...path] ─────> ├─ /api/v1/mcp  (MCP over HTTP)
                        (authenticated proxy)         ├─ /api/v1/oauth/* (AS)
                                                      └─ /.well-known/oauth-*
AI client (claude.ai) ──OAuth 2.1 + PKCE────────────> /api/v1/mcp
```

### Frontend architecture

Next.js 16 App Router with `cacheComponents: true` (PPR) and the React Compiler enabled. Routes are split into two groups: `(auth)` for login/register and `(app)` for everything behind a session. The browser **never** holds a token — `lib/api.ts` only ever calls `/api/backend/*` on its own origin, and the BFF attaches the bearer token server-side from an httpOnly cookie.

Rendering is a deliberate hybrid: `app/(app)/dashboard/page.tsx` renders a static shell, then an async Server Component (`DashboardContent`) calls `connection()` to opt out of prerendering, prefetches four endpoints in parallel via `lib/server-api.ts`, seeds a per-request TanStack QueryClient, and hands it to the client tree through `<HydrationBoundary>`. Every other page is a plain `"use client"` component fetching through hooks.

`proxy.ts` (Next 16's replacement for `middleware.ts`) is the route gate: it checks only for the *presence* of the refresh cookie — no verification — and redirects between `/login` and `/dashboard`. It also carries the `mcp_authorize` parameter through the login flow so an interrupted MCP connection resumes.

### Backend architecture

A NestJS 10 modular monolith, one module per bounded concept (`accounts`, `categories`, `transactions`, `draft-transactions`, `ledger`, `analytics`, `search`, `goals`, `ai`, `mcp`, `oauth`, `users`, plus stubs `budgets` and `notifications`). Each module is a controller → service → Prisma stack. Cross-module calls go service-to-service (`TransactionsService` → `LedgerService`, `CategoriesService`, `AccountsService`), never controller-to-controller, and never Prisma-from-controller. That discipline holds throughout — it is the best structural property of the codebase.

Three global providers in `app.module.ts`: `ThrottlerGuard`, `PrismaExceptionFilter`, `LoggingInterceptor`. Validation is deliberately *not* global — each route applies `new ZodValidationPipe(schema)` per parameter, which keeps the schema and the route visibly paired but means a forgotten pipe fails open.

`EventEmitter2` provides in-process domain events (`transaction.created`, `draft-transaction.created`). Only one consumer does real work: `AnalyticsService.invalidateOnTransaction` clears cached monthly summaries. `NotificationsService` logs a line. There is no queue and no out-of-process worker, despite the README claiming Redis + BullMQ.

Two cron jobs run in-process via `@nestjs/schedule`: `RecurringTransactionsCron` (generates due recurring occurrences) and `GoalsService.rolloverExpiredInstances` (closes finished goal periods and opens new ones). Both are daily at midnight, both assume exactly one running instance.

### Database architecture

Postgres via Prisma 7 with the `@prisma/adapter-pg` driver adapter. Five migrations, all additive — no destructive or data-backfilling migration exists yet.

The core model is a **derived-balance ledger**:

- `Transaction` is the business event. It deliberately has **no amount column**.
- `TransactionItem` holds the money: `(accountId, direction DEBIT|CREDIT, amount Decimal(18,4), currency)`.
- A balance is *always* `sum(CREDIT) - sum(DEBIT)` over items — never stored, never cached.

The sign convention is explicitly non-textbook (documented in `ledger.service.ts:9-17`): INCOME and EXPENSE are single-sided (one item, no contra account), only TRANSFER produces a balanced debit/credit pair. That is a reasonable simplification for personal finance, and it is honestly documented.

Multi-tenancy is enforced **by convention, in every query**, via `where: { userId }`. There is no row-level security, no Prisma middleware, and no tenant guard — each of the ~40 query sites is individually responsible. Ownership helpers (`AccountsService.assertOwned`, `CategoriesService.assertAvailable`, `GoalsService.assertOwned`) exist and are used consistently at the service boundaries, which is what keeps this working.

Supporting tables: `DraftTransaction` (the AI staging area), `AnalyticsCache` (a 15-minute cache stored *in Postgres*), `Goal`/`GoalInstance` (per-period goal snapshots), `Budget` (schema only — no code reads or writes it), `ApiKey`, and five OAuth tables (`OAuthClient`, `AuthorizationCode`, `OAuthRefreshToken`, `OAuthGrant`, `AuthSession`).

### Authentication and authorization

**Four** distinct credential types coexist:

| Credential | Issued by | Verified by | Used for |
|---|---|---|---|
| Access JWT (15 m) | `AuthService.issueTokens` | `JwtStrategy` (passport-jwt) | all first-party REST |
| Refresh JWT (30 d) | same | `AuthService.refreshTokens` | minting new access tokens |
| API key `mcp_<id>.<secret>` | `POST /auth/api-keys` | `ApiKeyAuthGuard` + bcrypt | MCP Inspector / dev clients |
| OAuth access JWT (15 m) | `OAuthService.mintTokens` | `OAuthMcpAuthGuard` | claude.ai MCP connector |

Both JWT families are signed with the **same** `JWT_ACCESS_SECRET`. The OAuth guard defends itself by additionally requiring `iss`, `aud` and `scope=mcp`; the first-party `JwtStrategy` checks none of those. That asymmetry is the root of SEC-03.

Authorization is purely ownership-based — there are no roles, no permissions, no admin surface. Every service method takes `userId` as its first argument and scopes its query by it.

The API key format is a nice detail: `mcp_<keyId>.<secret>` makes validation one indexed lookup plus one bcrypt compare, instead of scanning and comparing every key in the table.

### API architecture

REST under `/api/v1`, resource-per-controller, `@nestjs/swagger` documentation generated from the same Zod schemas via a custom `ApiZodBody`/`ApiZodQuery` bridge (`common/swagger/api-zod.ts`). Responses are raw Prisma objects — no response DTOs, no serialization layer, no envelope. List endpoints return bare arrays with no pagination metadata.

The OAuth 2.1 authorization server is hand-written (`modules/oauth/`) and implements RFC 8414 discovery, RFC 9728 protected-resource metadata, RFC 7591 dynamic client registration, mandatory PKCE S256, single-use hashed authorization codes, rotating hashed refresh tokens with family-based reuse detection, and a server-rendered consent screen. Its two discovery documents are excluded from the global `api/v1` prefix in `main.ts` because they must live at the origin root.

The MCP server (`modules/mcp/`) uses the official SDK's stateless Streamable HTTP transport: a fresh `McpServer` is constructed per request and bound to the authenticated `userId`, so tool handlers physically cannot address another user's data. Nine tools are exposed; each validates its arguments with the same Zod schema as the equivalent REST route.

### External services / integrations

Only three, and all are thin:

- **Google Sign-In** — the web BFF is the OAuth client; the backend holds the client secret and performs the code exchange server-to-server.
- **claude.ai / ChatGPT / Gemini CLI** as MCP clients, via the OAuth server above.
- **Postgres** (Neon in the live `.env`).

No email provider, no payment provider, no bank aggregator, no object storage, **no LLM provider**. The "AI layer" is a 17-line regex (`AiService.stubParse`).

### State management

Server state is TanStack Query v5 exclusively, with a typed key factory (`lib/query-keys.ts`) and per-domain stale times centralized in `lib/query-client.ts` (`STALE.balances = 30 s`, `accounts = 5 min`, …). Retries are correctly suppressed for 400/401/403/404/409/429.

Client state is local `useState` — there is no Redux/Zustand/Context store, and none is needed. Forms are react-hook-form + `zodResolver`, with `makeTransactionSchema(accounts)` building a schema closed over the loaded account list so currency and account rules can be validated client-side.

Notably, the selected dashboard account lives in `DashboardBody`'s `useState` and is passed down to every card, which each refetch independently — no URL state, so the selection is lost on reload and cannot be linked.

### Important shared utilities

- `lib/decimal.ts` — Decimal.js wrapper with an explicit rule: money is *always* a string, never a number. Well done and mostly obeyed.
- `lib/format.ts` — all money/date display, `Intl.NumberFormat` cached per currency, with a deliberate fix for code-style currencies (`30 TND`, not `TND 30`).
- `lib/form-errors.ts` — one `handleApiError` that maps 400 field errors into react-hook-form and toasts everything else.
- `common/dto/common-fields.ts` / `pagination.ts` — shared Zod primitives (`amountStringSchema`, `currencySchema`, bounded pagination).
- `common/dto/*` and `modules/*/dto/*` — schemas reused by HTTP, MCP and Swagger simultaneously. This is the single best design decision in the repository.

### Deployment / infrastructure

There isn't any. `backend/docker-compose.yml` starts a local Postgres and nothing else. There is no Dockerfile for either app, no CI configuration, no IaC, no reverse proxy config, no process manager, no health endpoint, and no graceful-shutdown wiring. The live `.env` exposes the backend through an ngrok tunnel — which is how the MCP connector is being demoed, and is fine for that, but it means the current "production" is a laptop.

### Communication between frontend and backend

Two paths, both server-to-server:

1. **`/api/backend/[...path]`** — a catch-all proxy. Reads the access-token cookie, forwards method/query/body to `${BACKEND_URL}/<path>`, and on a 401 performs exactly one deduplicated refresh + retry, writing rotated tokens onto the response. It forwards only `content-type` and `authorization`, and returns only the body, status and content-type.
2. **`lib/server-api.ts`** — direct server-side `fetch` used by the dashboard's Server Component prefetch. Returns `null` on any failure.

The browser therefore talks only to its own origin, cookies are `httpOnly; sameSite=lax; secure` (in production), and CORS is never needed on the backend — which is why its absence is correct here rather than a finding.

---

## 2. Main request / data flows

### Recording a transaction (the core write path)

```
POST /transactions
  → TransactionsController (JwtAuthGuard → req.user)
  → ZodValidationPipe(createTransactionSchema)        shape only
  → TransactionsService.create(userId, command)
      1. validateCommand()          cross-field rules; splits must sum to total
      2. categoriesService.assertAvailable()   for the tx and every split item
      3. ledgerService.buildEntriesForCommand()
           - assertOwned() each account (also rejects archived accounts)
           - reject currency mismatch between account and transaction
           - shape 1..n TransactionItem rows (2 for TRANSFER)
      4. prisma.$transaction:  create Transaction → createMany(items) → re-read
      5. emit transaction.created  → AnalyticsService invalidates that month's cache
```

Steps 1–3 happen **before** and **outside** the database transaction, so all validation is complete before anything is written. Step 4 is properly atomic. This path is the best-engineered code in the project.

### Approving an AI draft (the core "safety" path)

```
Drafts page → DraftReviewForm  (user edits amount/date/account/category)
  → useApproveDraft → PATCH /api/backend/draft-transactions/:id/approve  { parsedData: edits }
  → BFF proxy forwards the body
  → DraftTransactionsController.approve(user.id, id)         ← body is never read
  → DraftTransactionsService.approve
      1. find draft (scoped by userId), require PENDING
      2. TransactionsService.create(userId, draft.parsedData)   ← the ORIGINAL guess
      3. separate update: status = APPROVED                     ← not in the same transaction
```

The edits are transmitted and discarded. See **DATA-01**.

### Connecting an AI client (the MCP OAuth bridge)

```
claude.ai → GET /.well-known/oauth-protected-resource      (RFC 9728)
          → GET /.well-known/oauth-authorization-server    (RFC 8414)
          → POST /api/v1/oauth/register                    (RFC 7591, open)
          → GET  /api/v1/oauth/authorize?…code_challenge=…
                 no backend session cookie
                 → 302 to WEB_URL/login?mcp_authorize=<authorize URL>
          user logs in on the web app (or is already logged in — proxy.ts detects
                 mcp_authorize and skips the dashboard bounce)
          → GET /api/auth/mcp-handoff?continue=<authorize URL>
                 exchanges the httpOnly access token for a one-time handoff secret
                 (refreshing it first if expired — the loop-breaker)
          → GET  <backend>/api/v1/oauth/session/consume?handoff=…&continue=…
                 validates, ROTATES the secret, sets mofin_as_session cookie,
                 redirects back to /authorize (prefix-checked against the issuer)
          → consent screen → POST /api/v1/oauth/consent
          → 302 redirect_uri?code=…&state=…
          → POST /api/v1/oauth/token  (PKCE verifier)
          → access JWT (aud = MCP resource, scope = mcp) + opaque rotating refresh token
          → POST /api/v1/mcp  with Bearer
```

This flow is carefully built. The handoff secret is single-use and rotated at consume time so the value that travels in a URL never stays live; the issuer comes from config rather than the `Host` header; redirect URIs are exact-matched. The weaknesses are what happens *after* a token is issued (SEC-03) and the absence of any revocation path (SEC-06).

### Loading the dashboard

```
GET /dashboard
  → proxy.ts: refresh cookie present?  no → /login
  → static shell renders immediately
  → <Suspense> → DashboardContent (async RSC)
       await connection()            opt out of prerender
       Promise.all: serverGet /ledger/balance, /analytics/monthly-summary,
                            /search/transactions?limit=10, /users/me
       each returns null on ANY failure, including a 401 from an expired access token
       seed QueryClient with whatever succeeded → dehydrate
  → DashboardBody (client) renders cards; each card's hook either hydrates from
    the seeded cache or refetches through /api/backend/* (which can refresh)
```

The prefetch is a best-effort optimization, which is a sound design — but `primaryCurrency` and the greeting are computed *only* on the server from data that may be `null`, and are never corrected client-side. See **UX-01**.

---

## 3. Technology assessment

### Backend

| Technology | Purpose | Assessment |
|---|---|---|
| **NestJS 10** | HTTP framework, DI, module system | Appropriate. Module boundaries are respected. Note 10.x is a major version behind (11 is current) while Prisma is on 7 — an unusual pairing. |
| **Prisma 7 + `@prisma/adapter-pg`** | ORM / migrations | Appropriate and current. The driver adapter is correctly required by Prisma 7. **No connection-pool configuration** is set anywhere, which matters against Neon. |
| **Zod 3** | validation, MCP tool schemas, Swagger source | Excellent fit, and the single-source-of-truth reuse across HTTP/MCP/OpenAPI is the strongest pattern in the codebase. Note the frontend is on **Zod 4** — the two halves of the repo are on different major versions of the same library. |
| **@nestjs/jwt + passport-jwt** | token issuance/verification | Appropriate, but `JwtStrategy` is configured without `issuer`/`audience`, which is the direct cause of SEC-03. |
| **bcrypt (cost 12)** | password + API key hashing | Appropriate and correctly configured. |
| **@modelcontextprotocol/sdk** | MCP server | Correct use of the stateless Streamable HTTP transport; per-request server construction is the right call for user scoping. |
| **@nestjs/throttler** | rate limiting | Present but **architecturally ineffective** — see REL-01. In-memory storage also means limits reset on deploy and are per-replica. |
| **@nestjs/schedule** | cron | Works for one replica. There is no leader election or advisory lock, so a second replica double-generates financial records. |
| **@nestjs/event-emitter** | domain events | In-process only. Reasonable for cache invalidation; misleading if read as a real event bus, since a failed handler silently loses the event. |
| **@nestjs/swagger** | API docs | Appropriate, but `SwaggerModule.setup('docs', …)` in `main.ts` is unconditional — the full API surface is published in production. |

**Missing where it matters:** `helmet` (no security headers on the OAuth consent pages), a structured logger (`pino`/`winston`), an error-reporting SDK, and `@nestjs/terminus` or any health endpoint.

**Dependencies that are risky or unnecessary:**
- `zod-to-json-schema` is fine, but the `as unknown as` cast around it in `api-zod.ts:59-62` exists to suppress a TS2589 depth error — a small sign the schemas are near a type-system limit.
- `source-map-support` as an explicit dependency is vestigial on modern Node.
- The README advertises **Redis + BullMQ**, which appear nowhere in `package.json` or the source. Documentation drift, not a dependency problem.

**Duplicate solutions for the same problem:** validation is Zod everywhere (good — the comments show class-validator was deliberately removed), but **error shaping is duplicated three ways**: `ZodValidationPipe` → `{message, errors[]}`, `PrismaExceptionFilter` → `{statusCode, message}`, and OAuth controllers → raw `schema.parse()` throwing an unhandled `ZodError` that Nest renders as a 500. Three formats for one concern.

### Frontend

| Technology | Purpose | Assessment |
|---|---|---|
| **Next.js 16 + React 19** | framework | Current. `cacheComponents` (PPR) and `reactCompiler` are both enabled; the code correctly respects the constraints they impose (`connection()` before `new Date()`, runtime data inside Suspense). This is well-informed use of new APIs. |
| **TanStack Query v5** | server state | Appropriate and idiomatic — typed key factory, per-domain stale times, correct retry policy, `placeholderData` for pagination. |
| **react-hook-form + Zod 4** | forms | Appropriate. `makeTransactionSchema(accounts)` closing over loaded data to validate currency rules client-side is a good pattern. |
| **decimal.js** | money math | Correct and necessary. The "never use `Number()` on money" rule is stated in the file header and mostly honored — with two leaks (`MoneyAmount amount={String(s.value)}` in the donut path, and `.toNumber()` for chart values). |
| **radix-ui + shadcn + tailwind v4** | UI | Appropriate. 21 `components/ui/*` primitives, consistently used. |
| **next-themes, sonner, lucide-react** | theming, toasts, icons | Fine, all used. |
| **`shadcn` as a runtime dependency** | — | **Wrong section.** `shadcn` is a CLI scaffolding tool; it belongs in `devDependencies` (or nowhere, since components are already vendored). It ships nothing to the browser but bloats installs. |
| **`@tanstack/react-query-devtools`** | — | In `dependencies`, not `devDependencies`. Verify it is actually tree-shaken out of the production bundle *(uncertain — not measured)*. |

**Missing where it matters:** any test runner at all (no Vitest/Jest/Playwright), and any `error.tsx`/`global-error.tsx`.

**Nothing here warrants replacement.** The stack choices are sound and mostly modern; the problems are in how a handful of them are wired, not in which ones were chosen.

### Repository-level

- The two halves have **independent lockfiles and no workspace** — no shared types package, so `frontend/web/lib/types.ts` is a hand-maintained mirror of the backend's Prisma models. Every drift between them is a silent runtime bug (see DATA-03, UX-02, CONTRACT-01). For a two-package repo owned by one team, this is the single highest-leverage structural change available.
- `frontend/web/.mcp.json` (gitignored, present on disk) contains a live Google Stitch API key. `backend/.env` (gitignored, present on disk) contains a live Neon connection string and a live Google OAuth client secret. Neither is committed — verified with `git ls-files` — but all three credentials should be treated as exposed and rotated.
