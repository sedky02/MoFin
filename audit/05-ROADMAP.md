# Phase 5 — Technical Debt Triage & Remediation Roadmap

## Technical debt triage

### Fix immediately — debt that is actively costing you

| Item | Why it cannot wait |
|---|---|
| **SEC-01** shared refresh promise | Live cross-user account takeover. Gets more likely with every new user. |
| **SEC-02** placeholder JWT secrets | Anyone reading the repo can forge tokens against a publicly-reachable host. |
| **DATA-01** discarded draft edits | Writing knowingly-wrong data into an append-only ledger, right now, with no repair path. |
| **SEC-03** MCP → REST escalation | Converts a scoped delegation into a permanent unrevocable credential. |
| **DATA-02 / DATA-04** non-atomic money ops | Every crash or deploy risks duplicated or orphaned financial records. |
| **SEC-05** unrevokable refresh tokens | No incident response is possible. This must exist before real users do. |
| Missing **Dockerfile / CI / health check** | Not debt in the usual sense — it is a prerequisite for having a production at all. |
| **Secret rotation** (Neon, Google client secret, Stitch key) | Cheap, and the assumption should be that they are exposed. |

### Can wait — real debt, schedule it

- **ARCH-01 / CONTRACT-01–02 / DATA-03** — the shared-contract problem. High value, but it is a refactor with a blast radius; do it deliberately after the bleeding stops. Interim: fix `transactionAmount` and `isSystem` pointwise.
- **PERF-01/02/03** — correct at current data volumes. Fix before the first user crosses a few thousand transactions, not before launch. `groupBy` for balances is a half-day and worth doing early because it is isolated.
- **OBS-01** — you will want this the first time something breaks in production, which is a strong argument for doing it *just* before launch rather than after.
- **DATA-05/06/07** — goal/analytics divergence. Confusing rather than dangerous. Fix as one piece of work with shared attribution and period helpers, plus boundary tests.
- **REL-01** rate limiting — the self-DoS half will bite at ~6 concurrent users, so it is nearer-term than its MEDIUM peers suggest.
- **API-01** pagination metadata — blocks proper pagination UI; needed before any list grows.
- **DB-01** table growth — harmless for months, then suddenly is not. A cron job and three indexes.
- **Testing** — integration tests for tenant isolation and the money paths. This is the highest-leverage *preventative* investment in the repository.

### Harmless — leave it alone

- **Empty `BudgetsService` and the `Budget` table.** Costs nothing except a `count()` in `CategoriesService.remove`. Delete it when you decide budgets are not happening; do not spend a sprint on it now.
- **`NotificationsService` logging stub.** It is honest about what it is.
- **The non-textbook ledger sign convention.** INCOME/EXPENSE being single-sided is a legitimate simplification for personal finance, it is clearly documented at `ledger.service.ts:9-17`, and converting to true double-entry would be a large migration for no user-visible benefit. Do not "fix" this.
- **Hand-written `components/ui/*` primitives.** Standard shadcn vendoring. Fine.
- **`as unknown as` casts in `api-zod.ts` and `mcp-server.factory.ts`.** Both are documented workarounds for genuine TypeScript inference limits (TS2589, deep generic inference in `registerTool`), with comments explaining why. Leave them.
- **UX-03** the "reveal" toggle on the public MCP URL. Cosmetic.
- **`AppController` "Hello World"** — delete it while adding `/health`, not as its own task.
- **Zod 3/4 split** — only worth resolving as part of the shared-contracts work.

---

## Remediation roadmap

Each phase is ordered so that later work is not invalidated by earlier work, and so that the highest-severity exposure closes first.

### Phase 1 — Stop the bleeding (days 1–3)
**Why first:** these are live, exploitable, and cheap to fix. Every day they remain open is a day of exposure, and two of them (SEC-02, SEC-01) require no attacker skill at all.

1. **SEC-01** — delete the module-level `refreshPromise`; call `doRefresh` directly. *(~10 lines.)* Add a concurrent-refresh regression test.
2. **SEC-02** — generate fresh secrets, separate the first-party and MCP signing keys, harden `env.validation.ts` to reject known-placeholder values and require ≥ 32 chars.
3. **Rotate** the Neon credentials, Google client secret, and Stitch API key.
4. **SEC-03** — add `issuer`/`audience` to `JwtStrategy` and `aud` to `AuthService.issueTokens`; reject scoped tokens on first-party routes.
5. **SEC-04** — remove `approve_draft_transaction` from `MCP_TOOLS`.
6. **SEC-10** — guard Swagger behind a non-production check.

*Exit criterion: no CRITICAL-severity security finding remains open.*

### Phase 2 — Data integrity and correctness (days 4–10)
**Why second:** wrong data written now is wrong forever — the ledger is append-only and there is no transaction delete endpoint. Every day of delay increases the volume of records that will eventually need manual repair. This must precede any performance or architecture work, because you do not want to optimize the writing of incorrect values.

1. **DATA-01** — accept, validate, merge and persist draft edits on approve. Re-validate the merged payload; store what was actually approved.
2. **DATA-02** — add `@@unique([parentTransactionId, occurredAt])`, then wrap generation + cursor advance in one transaction.
3. **DATA-04** — wrap draft approval in one transaction; make the status update conditional; make the 409 path reconcilable.
4. **DATA-03** — sum split items in `transactionAmount` (and plan to move it server-side in Phase 4).
5. **AI-01** — either wire a real parser or stop presenting a fabricated confidence score; at minimum fix the first-number and always-now bugs.
6. **Audit existing data** for duplicates and orphaned drafts created before these fixes, and repair them.

*Exit criterion: every money-writing path is atomic, idempotent, and records what the user actually approved.*

### Phase 3 — Reliability and operability (days 11–18)
**Why third:** you now write correct data; next make sure you can keep serving it and can tell when you cannot. This must precede a real deployment, because deploying without health checks, graceful shutdown or error reporting means the first production incident is also your first attempt at building diagnostics.

1. **SEC-05** — persist and rotate first-party refresh tokens (mirror the OAuth implementation); add a real `POST /auth/logout`; verify the user still exists on refresh.
2. **REL-01** — forward `X-Forwarded-For`, enable `trust proxy`, key auth throttling on email + IP, move to a shared store, and separate the tight limit from `/auth/me`.
3. **REL-02** — `AbortSignal.timeout` on every outbound fetch; map timeouts to 504.
4. **REL-03** — add `error.tsx`, `global-error.tsx`, `not-found.tsx`.
5. **REL-04** — map Prisma P1xxx/P2024 to 503 so the frontend's retry policy engages; log at `error`.
6. **UX-01** — fix the greeting and derive `primaryCurrency` client-side; distinguish 401 from outage in `serverGet`.
7. **OBS-01** — structured logging with request id + user id, log errors, `/health` liveness and readiness, error reporting on both apps.
8. **REL-05** — per-item try/catch in goal rollover.
9. **Deployment basics** — Dockerfile for each app, CI running lint + typecheck + tests, `app.enableShutdownHooks()`, move `prisma migrate deploy` out of `start:prod` into a separate release step, configure the Prisma connection pool.
10. **SEC-06** — API-key list/revoke endpoints and UI; OAuth grants list; `POST /oauth/revoke`.

*Exit criterion: you can deploy, observe, and recover.*

### Phase 4 — Architecture (days 19–30)
**Why fourth:** these changes are broad and would have conflicted with everything above. Doing them now means the fixes from Phases 1–3 are already in place and can be locked in by the new structure rather than re-litigated.

1. **ARCH-01 + the contract family** — introduce a shared contracts package (Zod schemas + inferred types) consumed by both apps; align Zod versions; add response DTOs for money-carrying endpoints; move `transactionAmount` server-side. This eliminates CONTRACT-01, CONTRACT-02, DATA-03 and every future drift as a class.
2. **DATA-05/06/07** — extract one category-attribution helper and one period-boundary helper; standardize on `occurredAt` and UTC; use them in analytics, goals and search.
3. **ARCH-02** — make `CurrentUser` throw; convert to a global guard with an explicit `@Public()` opt-out.
4. **ARCH-03** — advisory locks or external scheduling for both crons.
5. **API-01** — pagination envelopes with totals; a dedicated pending-draft count endpoint.
6. **SEC-09** — route OAuth endpoints through the validation pipe with RFC-shaped errors.

*Exit criterion: adding a field to the schema cannot silently break the frontend, and the same business rule has exactly one implementation.*

### Phase 5 — Performance (days 31–35)
**Why fifth:** none of this is a problem at current scale, and doing it earlier would mean optimizing code that Phases 2 and 4 were about to change. Doing it now, against the final shape, is a fraction of the work.

1. **PERF-01** — `groupBy` aggregation for balances and goal progress; add `userId` to the goal-progress filter.
2. **PERF-02** — single grouped query for the goals list, or cache `progressAmount` and recompute on `transaction.created`.
3. **PERF-03** — `pg_trgm` GIN index on `description`; validate `from <= to`.
4. **DB-01** — cleanup job for expired OAuth/session/cache rows, with supporting indexes.
5. **DB-02** — the missing indexes; partial unique index for global categories.

*Exit criterion: no endpoint's cost grows linearly with total account history.*

### Phase 6 — Testing (days 36–45)
**Why sixth rather than first:** writing tests against code you are about to restructure wastes most of them. Writing them now locks in every fix above and makes the next round of changes safe. The existing unit tests are good and should be kept as-is.

1. **Tenant isolation suite** — for every resource (accounts, categories, transactions, drafts, goals, search, analytics, ledger), assert that user B receives 404/empty for user A's ids. This is the single most important missing test and directly protects the `where: { userId }` convention the whole model rests on.
2. **Integration tests against a real Postgres** (testcontainers or a CI service) for the money paths: create transaction, split transaction, approve draft, generate recurring occurrence — including crash-between-steps behaviour for DATA-02/DATA-04.
3. **HTTP-layer tests** for request/response contracts, especially draft approval with edits — the test that would have caught DATA-01.
4. **OAuth flow test** — full authorize → consent → token → MCP call, plus PKCE failure, code reuse, and refresh-token reuse detection.
5. **Concurrency tests** — two simultaneous draft approvals; two simultaneous BFF refreshes with different users (SEC-01 regression).
6. **Frontend** — set up Vitest + Testing Library; cover `lib/format.ts` (especially `transactionAmount` with splits), `lib/decimal.ts`, and the transaction form's schema rules. Add one Playwright smoke test for login → dashboard → record transaction.
7. Replace the `"Hello World!"` e2e test with a health-check test.

*Exit criterion: the five most severe findings in this audit each have a test that would have caught them.*

### Phase 7 — Maintainability (ongoing)
1. Commit `backend/tasks/*.md` — remove `/tasks` from `.gitignore`. These design documents are the best onboarding material in the repo and are currently untracked (**DEBT-07**).
2. Reconcile the README with reality: it advertises Redis + BullMQ (absent) and AI-powered parsing (a regex stub).
3. Move `shadcn` and `react-query-devtools` to `devDependencies`.
4. Delete or build `BudgetsService` and the `Budget` table; remove `AppController`.
5. Remove dead fields: `savingsRate`, `DraftTransaction.reason`, and either implement or remove `settings.defaultCurrency`.
6. Add `defaultCurrency` to the settings UI — the dashboard already reads it.
7. **UX-02** — move dashboard account selection into the URL.
8. Consider a monorepo workspace, which the shared-contracts work in Phase 4 makes natural.

---

## Why this order

The sequence follows one rule: **fix things whose damage is irreversible before things whose damage is merely expensive.**

- Phases 1 and 2 address the irreversible — leaked credentials cannot be un-leaked, and financial records written to an append-only ledger cannot be un-written. Everything else is recoverable.
- Phase 3 buys the ability to *detect* problems, which is a precondition for safely doing anything else in production. Deploying before this means finding out about incidents from users.
- Phase 4 comes after 1–3 because architectural refactors are the most likely to introduce new bugs, and you want observability and correct data in place before you start moving walls. It also comes *before* performance and testing because both of those are cheaper against the final structure.
- Phase 5 is deliberately late: the performance problems are real but have zero impact at current data volumes, and two of the three live in code that Phase 4 restructures.
- Phase 6 is last among the substantive phases for one reason — tests written against code you are about to change are mostly wasted. The exception is any regression test written alongside a Phase 1–2 fix, which should be written immediately with the fix.

**Rough total:** 6–8 weeks for one experienced engineer to take this from "impressive prototype" to "defensible small-scale production". Phases 1–2 alone (about two weeks) move it from *actively dangerous* to *safe for a private beta with trusted users* — and if time is limited, that is the cut to make.
