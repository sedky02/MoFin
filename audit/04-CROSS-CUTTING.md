# Phase 3 — Cross-Cutting Analysis

These problems are invisible when reviewing any single file or layer. They only appear when following a value across the whole system.

---

## 1. The safety model is defeated at both ends simultaneously

MoFin's stated invariant is: *AI proposes → human reviews and corrects → ledger records what the human approved.*

Trace it:

| Stage | What the code does | Result |
|---|---|---|
| Propose (web) | `AiService.stubParse` takes the first number in the string, always stamps `occurredAt = now`, fabricates a confidence score | Wrong data enters the draft (**AI-01**) |
| Review | `DraftReviewForm` renders a full editable form and submits `{ parsedData: edits }` | Edits are transmitted |
| Approve (backend) | `approve(user.id, id)` — the controller declares no `@Body()` | **Edits discarded** (**DATA-01**) |
| Propose + approve (MCP) | `create_draft_transaction` and `approve_draft_transaction` are both tools on the same token | **Human removed entirely** (**SEC-04**) |

Each half is individually explicable. Together they mean the safety layer does not exist in either direction: through the web it accepts corrections and ignores them, and through MCP it can be bypassed by the actor it was built to constrain. A reviewer looking only at `draft-transactions.service.ts` sees reasonable code — the failure is in the seam between the controller signature and the client's request body, and in the tool inventory two directories away.

**This is the single most important cross-cutting finding**, because the draft mechanism is the product's core differentiator and the reason the ledger is append-only.

---

## 2. "Authentication is correct in isolation, bypassable through another endpoint"

This is the textbook cross-cutting pattern, and it is present twice.

**MCP token → full REST access.** `OAuthMcpAuthGuard` is meticulous: issuer, audience, and `scope=mcp` all enforced, with a comment explaining that `aud` + `scope` prevent a web token from being replayed at `/mcp`. Correct — in that direction. `JwtStrategy`, in a different module, checks only the signature, and both token families share `JWT_ACCESS_SECRET`. The careful guard is bypassed by the careless one (**SEC-03**).

**OAuth-scoped token → permanent unscoped credential.** Chain three independently reasonable decisions:
1. MCP tokens validate on REST routes (SEC-03).
2. `POST /auth/api-keys` is a normal JWT-guarded route.
3. There is no endpoint to list or revoke API keys (SEC-06).

A 15-minute connector token becomes an indefinite full-access credential that is invisible to the user and unaffected by disconnecting the connector. No single one of those three is a serious finding. Composed, they are the most severe access-control issue in the codebase after SEC-01.

**The lesson for this codebase:** the security model is expressed per-guard rather than per-*credential*. There is no single place that answers "what may a token with scope X do?" — the answer is distributed across which guard happens to be on which controller.

---

## 3. Transaction boundaries do not match business operations

Two of the three money-writing operations have a transaction boundary narrower than the business operation they implement.

| Business operation | Actual atomic unit | Gap |
|---|---|---|
| Record a transaction | `$transaction`: create Transaction + items | ✅ correct |
| Approve a draft | `$transaction` (create) … then a **separate** status update | Draft can be bricked (**DATA-04**) |
| Generate a recurring occurrence | `$transaction` (create) … then a **separate** cursor advance | Money can be **duplicated** (**DATA-02**) |

The pattern is identical in both broken cases: `TransactionsService.create` opens and closes its own transaction, so any caller needing a wider boundary cannot get one. The fix is also identical — accept an optional `Prisma.TransactionClient` parameter, which the codebase is already set up for (`LedgerService.createEntries` takes exactly such a `Db` argument).

Ask the audit question: *what happens if this fails halfway through?*
- Draft approval → a real ledger entry exists, the draft says PENDING, retrying returns 409 forever, and there is no reconciliation job. Permanent inconsistency requiring manual database repair.
- Recurring generation → the occurrence is regenerated on the next run. Duplicate money in an append-only ledger with no delete endpoint. **Unrecoverable through the product.**

Neither has an idempotency key, and neither has a unique constraint that would let the database refuse the duplicate.

---

## 4. Three modules implement the same business rule three different ways

"Which category does this money belong to?" has three answers in this codebase:

| Module | Rule | Location |
|---|---|---|
| Analytics | `item.category ?? transaction.category`; uncategorized bucketed as `'uncategorized'` | `analytics.service.ts:41-49` |
| Goals | `transaction.category.type` only — item categories ignored, uncategorized **excluded entirely** | `goals.service.ts:158-165` |
| Frontend | `tx.items[0]` for the amount; `tx.category` for the label | `format.ts:68`, `transaction-row.tsx` |

The same 200 TND split receipt therefore appears as 120+80 across two categories in the monthly summary, as 200 (or 0, if uncategorized) against a goal, and as **120** in the transaction list. Three numbers, one transaction, all on the same dashboard.

Related: the *time* rule also differs — analytics uses `occurredAt`, goals use `createdAt` (**DATA-05**), and goal periods use local-server-time month boundaries while analytics uses UTC (**DATA-07**). A transaction entered on the 1st for the previous month lands in different periods depending on which card is asking.

**Root cause:** attribution and period logic are re-derived at each call site instead of living in one domain service. As features were added (splits in `137d1c8`, goals in `20260707141209`), each new consumer wrote its own interpretation and nothing forced them to agree. There is no test comparing the two numbers.

---

## 5. Validation is consistent; error *shape* is not

Validation itself is one of this repo's strengths — Zod schemas are shared verbatim between HTTP routes, MCP tools and Swagger, so `create_draft_transaction` via MCP enforces exactly what `POST /draft-transactions` does. That is genuinely well done.

Error *responses* are the opposite — three incompatible shapes for one concern:

| Source | Shape | Status |
|---|---|---|
| `ZodValidationPipe` | `{ message, errors: [{path, message}] }` | 400 |
| `PrismaExceptionFilter` | `{ statusCode, message }` | 409 / 404 / 400 |
| OAuth controllers (`schema.parse`) | Nest default 500 body | **500** |

The frontend's `handleApiError` is written against the first two (`error.status === 400 && error.validation?.length`) and has no path for the third — so a malformed OAuth request produces a generic "Something went wrong" toast for what is actually a client-side validation error (**SEC-09**).

Worse, the third bucket in `PrismaExceptionFilter` maps *database outages* (P1001, P2024) to **400**, and the frontend's retry policy explicitly refuses to retry 400s (`query-client.ts:30`). So a transient connection blip surfaces as a permanent, non-retryable client error (**REL-04**). An error-handling decision in the backend filter silently disables a resilience decision in the frontend query client — neither file is wrong on its own.

---

## 6. The BFF makes a backend security control structurally impossible

`AuthController` carries `@Throttle({ limit: 5, ttl: 60_000 })` with the comment *"to blunt brute-force / abuse (audit B5)"*. The intent is right and the code is right.

But the architecture guarantees it cannot work: **every request reaches the backend from the Next.js server**, and `forward()` sets only `content-type` and `authorization` — no `X-Forwarded-For`. `ThrottlerGuard` keys on `req.ip`, so the entire user base shares one bucket. The control simultaneously (a) fails to stop an attacker hitting the backend origin directly and (b) rate-limits legitimate users against each other at five logins per minute *in total* (**REL-01**).

This is only visible by reading the frontend proxy and the backend guard together. Neither file contains a bug.

The same architectural fact has a second consequence: the backend cannot log or alert on per-user or per-IP behaviour, because it cannot see either. Combined with the absence of request ids (**OBS-01**), a production incident cannot be traced from a user report back to a backend log line.

---

## 7. Frontend assumptions contradict backend behaviour — with no mechanism to detect it

`frontend/web/lib/types.ts` is a hand-written mirror of the Prisma schema, maintained by discipline alone. Four drifts already exist:

| Frontend believes | Backend actually sends | Consequence |
|---|---|---|
| `Category.isSystem: boolean` (required) | field does not exist | System/user split is broken; global categories show edit buttons that 404 (**CONTRACT-01**) |
| `confidenceScore: number` | `Decimal` → string | Survives only by JS coercion (**CONTRACT-02**) |
| `savingsRate: number` | `.toFixed(4)` → string | Never rendered, so never noticed (**CONTRACT-02**) |
| `DraftTransaction.reason` | `rejectionReason` | Rejection reasons never display (**DEBT-03**) |
| one item per transaction | 1..n after the splits feature | **Wrong amounts shown** (**DATA-03**) |

Every one of these is a silent runtime divergence that TypeScript actively *conceals* — the types compile, so both sides look correct. There is no codegen, no shared package, no contract test, and no integration test that would catch the next one. The two halves are also on different major versions of Zod (3 vs 4), which forecloses the obvious fix.

**This is a structural problem, not five bugs.** Given the repo already standardizes on Zod, a shared `packages/contracts` exporting schemas plus inferred types to both sides would eliminate the entire class.

---

## 8. Scaling out breaks financial correctness

Three independent decisions are each fine for one process and jointly hostile to horizontal scaling:

1. **Crons run in-process** (`@nestjs/schedule`) — every replica generates every recurring transaction (**ARCH-03**). With no unique constraint on `(parentTransactionId, occurredAt)` (**DATA-02**), N replicas multiply every recurring charge by N.
2. **Throttler storage is in-memory** — limits are per-replica, so the effective rate limit is N × the configured value, and resets on every deploy (**REL-01**).
3. **Migrations run on boot** — `start:prod` is `prisma migrate deploy && node dist/main.js`, so replicas race to migrate on rollout.

Meanwhile the BFF's `refreshPromise` bug (**SEC-01**) has the inverse property: it gets *worse* with concurrency on a single instance. So the current architecture is unsafe both scaled up and scaled out, for different reasons.

Note this is latent — there is no deployment configuration at all right now (**no Dockerfile, no CI**), so nothing scales today. The point is that the first attempt to deploy properly will corrupt financial data unless these are fixed first.

---

## 9. Error handling breaks the user flow at exactly the wrong moment

Follow a returning user whose 15-minute access token has expired — the single most common session state in the product:

```
proxy.ts sees the refresh cookie → allows /dashboard
  → serverGet ×4 → all 401 → all return null          (server-api.ts:34)
  → primaryCurrency = "USD"   (real money is TND)
  → greeting = "Welcome back, undefined"
  → client hooks refetch through the proxy → refresh succeeds → cards populate correctly
  → but primaryCurrency and greeting were computed server-side and are never recomputed
```

The user lands on a dashboard headed *"Welcome back, undefined"* with a monthly summary labelling their TND spending in **USD** (**UX-01**). The self-healing design is correct for query state and simply does not cover derived props.

And if a genuine render error occurs anywhere in that tree — a `[0][0]` index into an empty array in `pickPrimaryCurrency`, an unexpected shape from any of the contract drifts above — there is **no `error.tsx` anywhere in the app** (**REL-03**), so the page blanks with no message and no retry, and nothing reports it because there is no error reporting (**OBS-01**).

Each layer degrades gracefully in isolation. Composed, they degrade into a confidently-wrong financial display, then into a blank screen, then into silence.

---

## 10. The test suite cannot catch any of the above

746 lines of backend unit tests exist. They test pure functions with hand-rolled mocks (`new GoalsService({} as never, {} as never)`), covering goal status evaluation, ledger entry shaping, `computeNextOccurrence`, and API-key format parsing. Those tests are *good* — well-chosen cases, meaningful assertions, no coverage theater.

But note what they structurally cannot reach:

- **Nothing tests multi-tenancy.** There is no test anywhere asserting that user A cannot read user B's transactions, accounts, goals or drafts — despite tenant isolation resting entirely on a `where: { userId }` convention applied by hand at ~40 call sites, plus one fail-open decorator (**ARCH-02**).
- **Nothing tests the HTTP layer**, so the approve-endpoint body mismatch (**DATA-01**) — the product's central feature — is invisible to CI.
- **Nothing tests against a database**, so transaction boundaries (**DATA-02**, **DATA-04**), constraint behaviour, and N+1s are untested.
- **Nothing tests the frontend at all** (zero test files), so every contract drift in §7 ships silently.
- **The only e2e test is the unmodified Nest scaffold** asserting `"Hello World!"` — it boots the entire `AppModule`, requiring a live database and complete environment, to check a string from dead code (**DEBT-02**).

The suite validates the parts that were easiest to reason about, and is absent exactly where the system's real risk lives: the seams between layers. That is the defining characteristic of this codebase as a whole — **the individual components are better than the connections between them.**
