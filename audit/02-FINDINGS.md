# Phase 2 & 4 — Prioritized Findings

Severity definitions: **CRITICAL** = immediate security hole, data corruption, or catastrophic failure · **HIGH** = likely production bug, significant security issue, or major architectural flaw · **MEDIUM** = meaningful correctness/reliability/performance/maintainability problem · **LOW** = technical debt with limited immediate impact.

Fix-order column is the recommended global sequence (see [`05-ROADMAP.md`](05-ROADMAP.md)).

---

# CRITICAL

## SEC-01 — Shared refresh promise leaks one user's tokens to another user
**Severity:** CRITICAL · **Category:** Security / Concurrency · **Fix order:** 1
**Location:** `frontend/web/app/api/backend/[...path]/route.ts:16-27`, used at `:90-98`

### Problem
The BFF proxy deduplicates in-flight token refreshes using a **module-scoped** variable:

```ts
let refreshPromise: Promise<BackendTokens | null> | null = null;

async function refreshTokens(refreshToken: string): Promise<BackendTokens | null> {
  if (!refreshPromise) {
    refreshPromise = doRefresh(refreshToken).finally(() => { refreshPromise = null; });
  }
  return refreshPromise;          // ← the argument is IGNORED when one is in flight
}
```

In a Node server, module scope is shared by every concurrent request from every user. When a refresh is already in flight, the `refreshToken` argument is discarded and the caller receives **the other user's** token pair.

### Why it is a problem
The returned tokens are then written straight into the *calling* user's browser:

```ts
const tokens = await refreshTokens(refreshToken);   // may be user A's tokens
const retry  = await forward(req.clone(), targetPath, tokens.accessToken);
applyTokenCookies(res, tokens);                     // ← A's access + refresh cookies set on B
```

`applyTokenCookies` sets a 30-day refresh cookie. This is not a transient glitch — user B's browser is now permanently authenticated as user A.

### Real-world impact
Total, silent account takeover in both directions. User B sees user A's accounts, balances, transactions and goals, and can write to A's ledger. A can equally receive B's tokens. The window is small (one refresh round-trip, ~tens of ms) but the probability rises with the square of concurrent users, and access tokens expire every 15 minutes — so 401-triggered refreshes are frequent and naturally *synchronized* across users (everyone who logged in around the same time refreshes around the same time). In a finance app this is the worst possible failure mode, and the victim gets no signal that it happened.

### Evidence
The lock was clearly written with a browser-side single-user SWR pattern in mind — the comment says *"Concurrent 401s share ONE in-flight refresh so we never stampede /auth/refresh"*, which is correct reasoning for a client, and exactly wrong for a shared server process.

### Recommended solution
Delete the module-level cache entirely and call `doRefresh(refreshToken)` directly — a per-request refresh is cheap and correct. If stampede protection is genuinely wanted, key the in-flight map by the refresh token itself (`Map<string, Promise<…>>`) so two different users can never share an entry, and delete the entry in `finally`. Also add a regression test that fires two concurrent 401 requests with different refresh tokens and asserts each response carries its own tokens.

---

## SEC-02 — Placeholder JWT signing secrets in the live environment
**Severity:** CRITICAL · **Category:** Security / Configuration · **Fix order:** 2
**Location:** `backend/.env` (untracked, present on disk), `backend/src/config/env.validation.ts:9-10`

### Problem
The live `.env` — the same file that points `OAUTH_ISSUER` at a public ngrok tunnel and carries a hosted Neon database URL — signs every token with the example values:

```
JWT_ACCESS_SECRET="replace-me-access"
JWT_REFRESH_SECRET="replace-me-refresh"
```

These are the literal strings published in `backend/.env.example`, which *is* committed. The startup validator only enforces `z.string().min(16)`; `"replace-me-access"` is 17 characters, so it passes.

### Why it is a problem
JWT verification proves only that the signer knew the secret. Anyone reading the repository knows it. Forging `{ sub: "<any user id>", email: "…" }` signed HS256 with `replace-me-access` yields a token that `JwtStrategy` accepts on every REST endpoint — and, because `OAuthMcpAuthGuard` uses the same secret, a token with the right `iss`/`aud`/`scope` claims also passes the MCP guard.

### Real-world impact
Full impersonation of any user whose id an attacker can obtain or guess (ids are UUIDv4, so this needs one leaked id — e.g. from an `accountId` in a shared screenshot, or by registering and observing the shape). Read and write access to that user's entire financial history. The backend was reachable on a public URL at the time of audit, so this is not theoretical.

### Evidence
`env.validation.ts:9-10` — `JWT_ACCESS_SECRET: z.string().min(16)`. A length check cannot detect a known-plaintext secret.

### Recommended solution
1. Generate fresh secrets now (`openssl rand -base64 48`) and rotate — this invalidates all outstanding tokens, which is the desired effect.
2. Use **different** secrets for the first-party and OAuth token families (see SEC-03).
3. Harden validation: require ≥ 32 characters *and* reject any value present in `.env.example` or matching `/replace.?me|change.?me|secret|example/i`. Fail startup loudly.
4. Move secrets out of a dotfile into the deployment platform's secret store before any real deployment.
5. Rotate the Google OAuth client secret and the Neon credentials in the same file, plus the Google Stitch API key in `frontend/web/.mcp.json`, on the assumption that a file living beside a public tunnel config is exposed.

---

## DATA-01 — Draft approval silently discards the user's corrections
**Severity:** CRITICAL · **Category:** Data integrity / Frontend↔Backend contract · **Fix order:** 3
**Location:** `backend/src/modules/draft-transactions/draft-transactions.controller.ts:43-46` and `.service.ts:40-70`; `frontend/web/hooks/useDrafts.ts:84-106`; `frontend/web/components/drafts/draft-review-form.tsx:92-108`

### Problem
The frontend sends the user's corrected values with the approval:

```ts
api.patch(`/draft-transactions/${id}/approve`,
  edits && Object.keys(edits).length ? { parsedData: edits } : undefined)
```

The backend route takes no body at all:

```ts
@Patch(':id/approve')
approve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
  return this.draftsService.approve(user.id, id);
}
```

and the service commits `draft.parsedData` — the value written at parse time — to the ledger.

### Why it is a problem
This is the product's central safety claim. The README states: *"User reviews and approves → Final transaction is recorded"* and *"This prevents incorrect or hallucinated financial data from being saved."* `DraftReviewForm` renders a full editable form (amount, date, description, from/to account, category), validates it against the real account list, and submits — and every keystroke is thrown away by the server with a 200 OK.

### Real-world impact
The user reviews a draft that says *"Coffee — 3 TND"*, corrects it to *12 TND* on the correct account, clicks **Approve & record**, sees "Draft approved — transaction recorded", and their ledger now contains *3 TND on the wrong account*. There is no error, no warning, and no way to edit the transaction afterwards (the ledger is append-only — there is no update or delete endpoint for transactions). The corrupted record is permanent.

It gets worse in combination with **AI-01**: `AiService.stubParse` takes the **first** number in the input string, so "coffee at 3pm for 12 TND" parses as 3, and always stamps `occurredAt = now`. The review form is the only place those errors can be caught — and it doesn't work. If the parser finds no digits at all it emits `amount: "0"`, and approval then fails with *"Amount must be greater than zero"* forever, because the correction that would fix it is discarded: the draft is permanently unapprovable and cannot be edited.

### Recommended solution
Accept and validate an optional body on approve:
```ts
@Patch(':id/approve')
approve(@CurrentUser() user, @Param('id') id,
        @Body(new ZodValidationPipe(approveDraftSchema)) dto: ApproveDraftDto) {
  return this.draftsService.approve(user.id, id, dto.parsedData);
}
```
with `approveDraftSchema = z.object({ parsedData: parsedDraftTransactionSchema.partial().optional() })`. In the service, merge `{...draft.parsedData, ...overrides}`, re-validate the merged object with `parsedDraftTransactionSchema`, and **persist the merged result back onto the draft row** so the audit trail records what was actually approved versus what was parsed. Everything downstream (`TransactionsService.create`) already validates ownership and currency, so the merge is safe.

Until that ships, the honest interim fix is to disable the edit affordance in `DraftReviewForm` rather than let it lie.

---

# HIGH

## SEC-03 — MCP connector tokens are accepted by every first-party REST endpoint
**Severity:** HIGH · **Category:** Security / Broken access control · **Fix order:** 4
**Location:** `backend/src/modules/auth/strategies/jwt.strategy.ts:14-20` vs `backend/src/modules/oauth/oauth.service.ts:270-283` and `backend/src/common/guards/oauth-mcp-auth.guard.ts:36-55`

### Problem
`OAuthService.mintTokens` signs MCP access tokens with `JWT_ACCESS_SECRET` — the same key used for first-party web sessions. `OAuthMcpAuthGuard` defends the MCP endpoint by additionally requiring `issuer`, `audience` and `scope=mcp`. `JwtStrategy` requires **none** of those:

```ts
super({
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  ignoreExpiration: false,
  secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET')   // no issuer, no audience
});
```

The guard's own comment says *"requiring aud+scope stops a plain web-session token from being replayed against the MCP endpoint"* — which is true, and only covers one direction. The reverse replay is wide open.

### Why it is a problem
The `mcp` scope is presented to the user on the consent screen as *"read and act on your MoFin data via MCP tools"* — a bounded set of nine tools. In reality the token it produces is a full-privilege session token for the entire REST API.

### Real-world impact
A compromised or malicious MCP client (or anyone who obtains a connector token — from a client's logs, a proxy, or its token store) can call every REST endpoint, not just the nine tools: archive accounts, delete categories, update the user profile, edit and cancel recurring series, and — most seriously — `POST /auth/api-keys` to mint a **permanent** `mcp_…` API key that survives OAuth refresh-token revocation entirely. That converts a 15-minute scoped token into indefinite full access. The user has no way to see or revoke that key (see SEC-06).

### Recommended solution
Two independent fixes, apply both:
1. **Separate the keys.** Introduce `JWT_MCP_SECRET` (or asymmetric keys) so an MCP token is not even a candidate signature for the first-party verifier.
2. **Constrain the first-party verifier.** Configure `JwtStrategy` with `issuer` and `audience` for the web audience, and reject any token carrying a `scope` claim. Add `aud: 'mofin-web'` to `AuthService.issueTokens`.

Then add a test asserting an MCP-minted token is rejected by `GET /users/me`.

---

## SEC-04 — The AI can approve its own drafts, defeating the safety model
**Severity:** HIGH · **Category:** Security / Architecture · **Fix order:** 5
**Location:** `backend/src/modules/mcp/dto/mcp.dto.ts:15`, `backend/src/modules/mcp/mcp.service.ts:32-33`, `backend/src/modules/mcp/mcp-tools.ts`

### Problem
`approve_draft_transaction` is exposed as an MCP tool alongside `create_draft_transaction`. An AI client holding a single `mcp`-scoped token can call both in sequence.

### Why it is a problem
The draft mechanism exists solely to put a human between the model and the ledger. The README is explicit: *"Draft transactions before confirmation · User approval required before committing financial data."* Exposing approval as a tool removes the human entirely — the "safety layer" becomes two tool calls the model makes on its own.

### Real-world impact
A prompt-injected or merely over-eager assistant writes financial records with no human confirmation. Because approval is a *tool* rather than an out-of-band user action, the very actor the control is designed to constrain holds the key. Combined with SEC-03, a connector token becomes a fully autonomous write channel into the user's money.

Note this is a *design* decision, not a bug — but it is a design decision that contradicts the product's stated security model, which is exactly the kind of thing a review should surface.

### Recommended solution
Remove `approve_draft_transaction` from `MCP_TOOLS`. Approval should happen only in the web UI (or a push notification / magic link), never through the same channel that created the draft. If AI-side approval is genuinely wanted later, gate it behind a *separate* OAuth scope (`mcp:approve`) that the consent screen names explicitly and separately, and make `mcp` read-plus-draft only. That also gives the scope string a reason to exist — currently `SUPPORTED_SCOPE = 'mcp'` is a single value that grants everything.

---

## DATA-02 — Recurring-transaction generation is non-atomic and non-idempotent
**Severity:** HIGH · **Category:** Data integrity / Reliability · **Fix order:** 6
**Location:** `backend/src/modules/transactions/recurring-transactions.cron.ts:29-55`

### Problem
Each occurrence is created and then the cursor is advanced in a **second, separate** statement:

```ts
await this.transactionsService.create(root.userId, { …, occurredAt: root.nextOccurrenceAt! });
const next = computeNextOccurrence(…);
await this.prisma.transaction.update({ where: { id: root.id }, data: { nextOccurrenceAt: next } });
```

If the process dies, the database connection drops, or the `update` fails between those two calls, the occurrence exists but `nextOccurrenceAt` still points at the same date. The next run regenerates it.

### Why it is a problem
There is no idempotency key. `Transaction` has no unique constraint on `(parentTransactionId, occurredAt)`, so nothing at the database level prevents the duplicate. And these are real money entries — a duplicated occurrence writes duplicate `TransactionItem` rows, which permanently shifts the derived balance.

### Real-world impact
A crash or deploy during the midnight cron duplicates rent, salary, subscriptions — silently. Users see a balance that is wrong by the amount of one recurring charge, with two identical transactions in their history and **no way to delete either** (the ledger is append-only with no delete endpoint). Recovering requires direct database surgery.

The same class of bug affects **DATA-04** (draft approval).

### Recommended solution
1. Add `@@unique([parentTransactionId, occurredAt])` to `Transaction` — the database then refuses the duplicate outright, and the cron's existing `catch` logs it harmlessly.
2. Wrap create + cursor-advance in one `prisma.$transaction`, which requires threading the transaction client through `TransactionsService.create` (it already accepts a `Db` client in `LedgerService.createEntries`, so the seam exists).
3. Before scaling past one replica, take a Postgres advisory lock (`SELECT pg_try_advisory_lock(…)`) at the top of each cron so only one instance runs it — `@nestjs/schedule` fires on **every** replica, which would multiply every recurring charge by the replica count. This applies equally to `GoalsService.rolloverExpiredInstances`.

---

## SEC-05 — Refresh tokens cannot be revoked; logout is cosmetic
**Severity:** HIGH · **Category:** Security / Session management · **Fix order:** 7
**Location:** `backend/src/modules/auth/auth.service.ts:43-58`, `frontend/web/app/api/auth/logout/route.ts:6-10`

### Problem
First-party refresh is stateless — the token is verified against its own secret and new tokens are minted, with no server-side record:

```ts
async refreshTokens(refreshToken: string) {
  payload = await this.jwtService.verifyAsync(refreshToken, { secret: JWT_REFRESH_SECRET });
  return this.issueTokens(payload.sub, payload.email);   // no DB lookup at all
}
```

Logout only clears cookies on the web origin:
```ts
export async function POST() {
  const res = NextResponse.json({ ok: true });
  clearAuthCookies(res);          // no call to the backend
  return res;
}
```

The code comments acknowledge this (*"Note this cannot revoke a leaked refresh token before expiry — persisting/rotating refresh tokens is a deliberate follow-up"*), which is honest, but the follow-up has not happened while the OAuth module right next door implements exactly this correctly.

### Why it is a problem
Three consequences:
- **Logout does nothing server-side.** A refresh token captured before logout stays valid for its full 30 days.
- **No panic button.** There is no way for a user or an operator to terminate sessions after a suspected compromise, short of rotating `JWT_REFRESH_SECRET` and logging out every user on the platform.
- **Deleted/disabled users keep access.** `refreshTokens` never checks the user still exists, and `JwtStrategy.validate` never touches the database — it returns `{ id: payload.sub, email: payload.email }` straight from the claims. A user deleted from the database continues to mint fresh access tokens for 30 days; their writes then fail with opaque foreign-key errors surfaced as 400s.

### Real-world impact
Any refresh-token exposure — shared device, XSS on a subdomain, a proxy log, a backup — is a 30-day unrevokable account compromise. For financial data that is the difference between an incident and a breach.

### Recommended solution
Mirror the OAuth implementation, which already does this properly in `OAuthService.exchangeRefreshToken`: persist a hashed refresh token with a `familyId`, rotate on every use, revoke the whole family on reuse detection. Add `POST /auth/logout` that revokes the presented token's family, and have the web `/api/auth/logout` route call it before clearing cookies. Add a `user.findUnique` check to `refreshTokens` so deleted users stop immediately.

---

## REL-01 — Rate limiting is architecturally ineffective
**Severity:** HIGH · **Category:** Security / Reliability · **Fix order:** 8
**Location:** `backend/src/app.module.ts:33`, `backend/src/modules/auth/auth.controller.ts:25`, `frontend/web/app/api/backend/[...path]/route.ts:45-67`

### Problem
Two compounding issues:

1. **Every request reaches the backend from one IP.** The browser never calls the backend — the Next.js BFF does, server-to-server. `ThrottlerGuard` keys on `req.ip`, so the backend sees a single client for the entire user base. `forward()` sets only `content-type` and `authorization` — no `X-Forwarded-For` — and Express `trust proxy` is not configured.
2. **Storage is in-memory.** `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])` with no `storage` option keeps counters in process memory: they reset on every deploy and are not shared across replicas.

### Why it is a problem
The intent — `@Throttle({ default: { limit: 5, ttl: 60_000 } })` on `AuthController`, explicitly commented *"to blunt brute-force / abuse"* — is inverted in practice:

- **It does not stop brute force.** An attacker hitting `/api/v1/auth/login` on the backend directly (it is publicly reachable via the tunnel) is limited per *their* IP, which they can rotate. Worse, attacking *through* the web app costs them nothing extra.
- **It is a self-DoS.** Five login attempts per minute are shared by **all** users combined, since they all arrive from the BFF's IP. Six people logging in within the same minute and the sixth gets a 429. The 100/minute global limit is hit by a handful of active users on a dashboard that fires four requests per load.

### Real-world impact
Unthrottled credential stuffing against the backend origin, plus spurious "Too many requests" errors for legitimate users at trivially low concurrency. The frontend even has a polished handler for it (`handleApiError` → *"Too many requests, try again shortly."*), so the failure is user-visible and looks like a platform problem.

### Recommended solution
1. Forward the real client IP from the BFF (`x-forwarded-for`) and enable `app.set('trust proxy', 1)` in `main.ts`.
2. Key auth throttling on **the submitted email plus IP**, not IP alone, using a custom `ThrottlerGuard.getTracker`. This is what actually stops credential stuffing.
3. Move to a shared store (`@nest-lab/throttler-storage-redis` or a Postgres-backed store) before running more than one replica.
4. Raise the global limit to something a real dashboard load can survive, and restrict the tight limit to `login`/`register`/`refresh` only — it currently also throttles `GET /auth/me` and API-key creation at 5/min.

---

## PERF-01 — Balances and goal progress are computed by loading every ledger row into memory
**Severity:** HIGH · **Category:** Performance / Scalability · **Fix order:** 12
**Location:** `backend/src/modules/ledger/ledger.service.ts:113-133`, `backend/src/modules/goals/goals.service.ts:140-167`

### Problem
`getBalance` fetches *all* matching `TransactionItem` rows and sums them in JavaScript:

```ts
const items = await this.prisma.transactionItem.findMany({ where });   // no take, no aggregate
for (const item of items) { … balances.set(key, current.plus(signed)); }
```

`GoalsService.computeProgressAmount` does the same for a BALANCE goal — with **no date lower bound and no `userId` filter**, so it reads every item that account has ever had:

```ts
const items = await this.prisma.transactionItem.findMany({
  where: { accountId: goal.accountId, createdAt: { lte: boundary } },
});
return items.reduce(…)
```

### Why it is a problem
This is the dashboard's hottest path. `useLedgerBalance` has a 30-second stale time and the dashboard prefetches `/ledger/balance` on every server render. The work is O(all transaction items the user has ever created), in Node, on every cache miss — and it is compounded by **PERF-02**: `GoalsService.list` calls `withLiveProgress` for every goal, each issuing its own full scan (an N+1 over full table scans).

Postgres can do this in a single indexed `SUM(…) GROUP BY` without transferring a row.

### Real-world impact
At 100 transactions the difference is invisible. At 50,000 items (about four years of moderate use) each balance request transfers tens of megabytes from Postgres, allocates a `Prisma.Decimal` per row, and blocks the event loop while summing — degrading latency for *every other user* on the instance, because Node is single-threaded. A dashboard with five goals issues six such scans per load. Against a serverless Postgres like Neon, the egress cost alone is material.

### Recommended solution
Replace both with database aggregation:
```ts
const rows = await this.prisma.transactionItem.groupBy({
  by: ['accountId', 'currency', 'direction'],
  where: { userId, ...filters },
  _sum: { amount: true },
});
```
then net CREDIT − DEBIT per group in code (a handful of rows, not a table). For goals, add `userId` to the `where` clause (defence in depth — the current query is safe only because `accountId` was ownership-checked upstream) and a matching index. If balances later need to be O(1), add a periodically-materialized per-account balance snapshot, but `groupBy` alone buys several orders of magnitude and should be done first.

---

## DATA-03 — Split transactions display only their first line item as the amount
**Severity:** HIGH · **Category:** Correctness / Frontend↔Backend contract · **Fix order:** 9
**Location:** `frontend/web/lib/format.ts:66-70`, used in `components/transactions/transaction-row.tsx:23` and `components/transactions/transaction-detail.tsx:69`

### Problem
```ts
/** Both legs of a TRANSFER carry the same amount, so the first item is correct for all types. */
export function transactionAmount(tx: Transaction): string {
  return tx.items[0]?.amount ?? "0";
}
```
The comment was true when written. Itemized splits were added later (commit `137d1c8`, *"add support for recurring transactions and itemized splits"*), and a split INCOME/EXPENSE transaction now has *n* items whose amounts sum to the total. The helper was never revisited.

### Why it is a problem
`TransactionsService.validateCommand` enforces that split items sum exactly to `command.amount`, so the backend data is correct — the display is wrong. And there is no `amount` column on `Transaction` to fall back on (by design), so nothing else in the UI can correct it.

### Real-world impact
A user splits a 200 TND supermarket receipt into 120 groceries + 80 household. The transaction list shows **120 TND**. The detail page shows **120 TND**. The dashboard's recent-transactions card shows **120 TND**. The ledger and the balance are right; every place the user *looks* is wrong, and the error is always an undercount. The user has no reason to distrust it.

### Recommended solution
Sum the legs, respecting the debit/credit convention:
```ts
export function transactionAmount(tx: Transaction): string {
  if (tx.type === "TRANSFER") return tx.items[0]?.amount ?? "0";   // both legs are equal
  return tx.items.reduce((sum, i) => add(sum, i.amount), "0");
}
```
Better still, have the backend return a computed `amount` on the transaction payload so the rule lives in one place — this is exactly the kind of derived value a response DTO should own rather than every client re-deriving it (see ARCH-01).

---

## UX-01 — Dashboard silently degrades to the wrong currency and "Welcome back, undefined"
**Severity:** HIGH · **Category:** Error handling / Frontend · **Fix order:** 10
**Location:** `frontend/web/lib/server-api.ts:29-38`, `frontend/web/app/(app)/dashboard/page.tsx:17-33, 58-79, 104-107`

### Problem
`serverGet` returns `null` on *any* non-OK response, including the routine 401 from a 15-minute-expired access token:

```ts
if (!res.ok) return null;
```
The dashboard then computes two values **only** on the server, from possibly-`null` data, and never corrects them on the client:

```ts
const primaryCurrency = pickPrimaryCurrency(balances, user);   // → "USD" when both are null
…
function greeting(name?: string | null): string {
  return `Welcome back, ${name}`;                              // → "Welcome back, undefined"
}
```

### Why it is a problem
The best-effort prefetch design is sound — the client hooks refetch through the proxy, which refreshes the token. But `primaryCurrency` and `greeting` are *not* query state; they are props computed once during SSR and frozen. The self-healing path does not cover them.

### Real-world impact
Two visible defects, both hitting the most common case (a returning user whose access token expired while the refresh token is still good):

1. **`MonthlySummaryCard` is handed `currency={primaryCurrency}`** and renders every category amount labelled **USD** when the user's money is in TND. Money shown under the wrong currency in a finance app destroys trust, and there is nothing on screen indicating it is a fallback.
2. **The header literally reads "Welcome back, undefined"** — and not only on the failure path: `displayName` is optional at registration and absent for many Google users, so a user who never set a name always sees it. The first-name extraction that would have handled this is commented out at `:105`.

### Recommended solution
- `greeting`: `const first = name?.trim().split(/\s+/)[0]; return first ? \`Welcome back, ${first}\` : "Welcome back";`
- `primaryCurrency`: derive it on the client from the live `useLedgerBalance`/`useUser` query data with the server value as initial state only, so it self-corrects on hydration. Or pass `null` and have `MonthlySummaryCard` render a currency-agnostic state until real data arrives — never a guessed currency.
- Distinguish 401 from other failures in `serverGet` so a genuine backend outage is not silently rendered as an empty dashboard. A finance app showing a confident, wrong "$0.00" during an outage is worse than showing an error.

---

## DATA-04 — Draft approval is not atomic; a mid-flight failure bricks the draft
**Severity:** HIGH · **Category:** Data integrity / Reliability · **Fix order:** 11
**Location:** `backend/src/modules/draft-transactions/draft-transactions.service.ts:40-70`

### Problem
```ts
const transaction = await this.transactionsService.create(userId, {…, draftId: draft.id});
// ← separate round trip, no shared transaction
const approved = await this.prisma.draftTransaction.update({
  where: { id: draft.id }, data: { status: DraftStatus.APPROVED, approvedAt: new Date() },
});
```
The transaction is committed by its own `$transaction`; the draft's status update is a second, independent write.

### Why it is a problem
If the process dies or the update fails in between, the ledger holds a real transaction while the draft is still `PENDING`. The user retries — and because `Transaction.draftId` is `@unique`, the retry hits P2002, which `PrismaExceptionFilter` turns into **409 Conflict: "A record with this draftId already exists"**.

### Real-world impact
The draft is permanently stuck: it shows as PENDING in the drafts list, approving always returns 409, and rejecting is blocked too (`reject` also requires `PENDING`… which it is, so rejection actually works — but that leaves an APPROVED-in-fact transaction attached to a REJECTED draft, which is worse). Meanwhile the pending-drafts badge in the sidebar shows a count that can never be cleared. There is no reconciliation job and no admin tooling to repair it.

The concurrency case is benign by luck: two simultaneous approvals both read `PENDING`, both call `create`, and the unique `draftId` makes exactly one win — the loser gets a 409. Correct outcome, accidental mechanism.

### Recommended solution
Wrap both writes in one `prisma.$transaction`, threading the transaction client into `TransactionsService.create` (the `Db = Prisma.TransactionClient` type already exists in `ledger.service.ts:7`). Make the status update conditional — `updateMany({ where: { id, status: PENDING }, data: {…} })` — so a race is decided by the database rather than by a unique-constraint side effect, and make the 409 path recoverable by detecting an existing transaction with this `draftId` and reconciling the draft's status instead of erroring.

---

## REL-02 — No timeouts on any server-to-server call
**Severity:** HIGH · **Category:** Reliability · **Fix order:** 13
**Location:** `frontend/web/app/api/backend/[...path]/route.ts:61-66`, `frontend/web/lib/auth-cookies.ts:54-59`, `frontend/web/lib/server-api.ts:30-33`, `backend/src/modules/auth/auth.service.ts:75-85`

### Problem
Every outbound `fetch` in the repository omits `signal`. Node's default has no request timeout.

### Why it is a problem
A hung backend (deadlocked query, exhausted connection pool, network black hole) does not produce an error — it produces a Next.js request that waits indefinitely, holding a server-side slot. The same applies to the backend's call to Google's token endpoint in `loginWithGoogle`.

### Real-world impact
One slow dependency cascades into total frontend unavailability rather than a degraded page: every dashboard load makes four parallel `serverGet` calls, so slots are consumed four at a time. Users see a spinner forever instead of an error they could act on. This is the classic way a partial outage becomes a full one.

### Recommended solution
Add `signal: AbortSignal.timeout(5_000)` to every outbound fetch (2–3 s for the BFF proxy, which sits in a user-facing path; 10 s for Google). Catch `TimeoutError` explicitly and return 504 rather than a generic failure, so the frontend's `handleApiError` can distinguish "slow" from "broken". Pair this with a circuit breaker if the backend ever moves off the same host.

---

## REL-03 — No error boundaries anywhere in the Next.js app
**Severity:** HIGH · **Category:** Error handling / Frontend · **Fix order:** 14
**Location:** `frontend/web/app/` — no `error.tsx`, `global-error.tsx`, or `not-found.tsx` exists (verified: 0 files)

### Problem
The App Router uses file-convention error boundaries. None are defined at any level.

### Why it is a problem
Any thrown error in a Server Component or during client render escapes to Next's built-in fallback — a blank page in production with no message, no retry, no navigation. Individual components handle *query* errors well (`ErrorState` with a retry button appears in `BalanceCards`, `MonthlySummaryCard`, `RecentTransactions`), so the gap is specifically **render-time** errors, which are the ones that take the whole page down.

Concrete triggers present in this codebase: `pickPrimaryCurrency` does `[...counts.entries()].sort(…)[0][0]` — an index into a possibly-empty array; `formatMoney` passes user-controlled currency strings to `Intl.NumberFormat` (guarded by try/catch, but `currencySchema` permits `[A-Z0-9]{3,8}`, so unusual codes reach it); and any contract drift like DATA-03/CONTRACT-01 can produce an undefined access deep in a component.

### Real-world impact
A single bad row or unexpected API shape blanks the entire dashboard with no recovery path but a manual reload, and the error is never reported anywhere because there is no error-reporting integration either (OBS-01).

### Recommended solution
Add `app/(app)/error.tsx` and `app/global-error.tsx` with a reset button and a report hook, plus `app/not-found.tsx`. Wire both into an error-reporting service. This is roughly 40 lines of work for a large reduction in worst-case blast radius.

---

# MEDIUM

## PERF-02 — Goals list is an N+1 over full table scans
**Severity:** MEDIUM · **Category:** Performance · **Fix order:** 15
**Location:** `backend/src/modules/goals/goals.service.ts:72-81, 130-138`

`list()` fetches all goals, then `Promise.all(goals.map(withLiveProgress))` — each issuing its own `computeProgressAmount` query (see PERF-01). A user with 10 goals triggers 11 queries per dashboard load, each an unbounded scan. `GoalsSummary` is on the dashboard, so this runs constantly. Fix with a single grouped aggregate across all goal accounts, or cache the instance's `progressAmount` and recompute on `transaction.created` (the event already exists).

## DATA-05 — Goal progress uses `createdAt`, analytics uses `occurredAt`
**Severity:** MEDIUM · **Category:** Correctness · **Fix order:** 16
**Location:** `backend/src/modules/goals/goals.service.ts:149-165` vs `backend/src/modules/analytics/analytics.service.ts:16-27`

Goals filter ledger items by `createdAt` (when the row was inserted); the monthly summary filters transactions by `occurredAt` (when the money moved). A back-dated transaction — entered today for last month, which is the normal case for catching up on receipts, and exactly what the `occurredAt` field exists for — counts toward *this* period's goal but *last* month's summary. The two numbers on the same dashboard disagree, and neither is obviously wrong to the user. Standardize on `occurredAt` (join through `transaction`), and add an index supporting it.

## DATA-06 — Goal progress ignores item-level categories and drops uncategorized money
**Severity:** MEDIUM · **Category:** Correctness · **Fix order:** 17
**Location:** `backend/src/modules/goals/goals.service.ts:158-166`

INCOME/EXPENSE goals filter on `transaction: { category: { type: categoryType } }`. Two consequences: (1) split items carrying their own `categoryId` are attributed by the *parent's* category, which contradicts `AnalyticsService`'s explicit handling (`analytics.service.ts:41-49` uses `item.category ?? transaction.category`); (2) a transaction with **no** category is excluded entirely, so an uncategorized expense does not count against a spending goal. A user tracking "spend under 500 this month" can blow past it with uncategorized purchases and see a green goal. Reuse the analytics attribution rule — ideally extract it into one shared function, since three modules now implement category attribution differently.

## DATA-07 — Timezone handling is inconsistent between modules
**Severity:** MEDIUM · **Category:** Correctness · **Fix order:** 18
**Location:** `backend/src/modules/goals/goals.service.ts:8-19`, `backend/src/modules/transactions/transactions.service.ts:17-24` vs `backend/src/modules/analytics/analytics.service.ts:16-17`

Goals and recurrence math use local-server-time constructors (`new Date(y, m, 1)`, `date.getMonth()`); analytics uses `Date.UTC`. Whether a transaction at 23:30 on the 31st falls in this month or the next depends on which module is asking and what `TZ` the server happens to run with. Deployments frequently run UTC while development runs local, so this bug is invisible until production. Pick UTC everywhere (or store an explicit user timezone in `User.settings` and compute against it), and add tests at month/year boundaries.

## CONTRACT-01 — `Category.isSystem` does not exist on the backend
**Severity:** MEDIUM · **Category:** Frontend↔Backend contract · **Fix order:** 19
**Location:** `frontend/web/lib/types.ts:47`, `frontend/web/app/(app)/categories/page.tsx:56, 151-152`

The frontend types `isSystem: boolean` as **required** and branches on it:
```ts
const userCategories   = (data ?? []).filter((c) => !c.isSystem);
const systemCategories = (data ?? []).filter((c) =>  c.isSystem);
```
The backend never sends it. The real distinction is `userId === null` (global categories, `categories.service.ts:14-18` returns `OR: [{ userId }, { userId: null }]`). So `isSystem` is always `undefined`: the "system" section is permanently empty, and global categories appear as the user's own with edit and delete buttons — which then 404, because `CategoriesService.update/remove` filter by `{ id, userId }`. Either expose `isSystem` (or `userId`) from the backend, or drop the concept. Note there is no seed script, so no global categories exist yet — which is why this hasn't been noticed.

## CONTRACT-02 — Decimal fields typed as `number` on the frontend
**Severity:** MEDIUM · **Category:** Frontend↔Backend contract · **Fix order:** 20
**Location:** `frontend/web/lib/types.ts:111, 167`; `components/common/badges.tsx:48-73`

`DraftTransaction.confidenceScore: number` and `MonthlySummary.savingsRate: number` are both **strings** at runtime — Prisma `Decimal` serializes to a string, and `savingsRate` is explicitly `.toFixed(4)` in `analytics.service.ts:54`. `ConfidencePill` currently survives on JS coercion (`Math.round("0.7200" * 100)` → 72, `"0.72" >= 0.8` → false), which is luck: any future `score.toFixed(…)` throws. Type them `string` and parse through `tryParse`, consistent with the project's own money rule. (`savingsRate` is computed and returned but never displayed anywhere — see DEBT-03.)

## API-01 — No pagination metadata anywhere
**Severity:** MEDIUM · **Category:** API design · **Fix order:** 21
**Location:** all list endpoints; `frontend/web/lib/types.ts:184`, `hooks/useSearch.ts:262-278`, `hooks/useDrafts.ts:45-58`

Every list returns a bare array (`export type Paginated<T> = T[]`). No total, no `hasMore`, no cursor. The frontend compensates with two different hacks: `useSearchPage` over-fetches `limit + 1` as a sentinel, and `useDrafts` infers "more" from `lastPage.length === PAGE`. Consequences: no page counts or "showing 1–25 of 340" is possible; the sentinel breaks at `limit: 100` because `limit + 1 = 101` exceeds `paginationSchema`'s `.max(100)` and returns a 400 *(uncertain — depends on whether the UI ever offers a 100-row page size; it currently does not)*; and `usePendingDraftCount` fetches up to 100 full draft objects just to call `.length`, silently capping the badge at 100. Return `{ data, total, limit, offset }` from list endpoints and add a dedicated count endpoint for the badge.

## PERF-03 — Unindexed `ILIKE '%…%'` search
**Severity:** MEDIUM · **Category:** Performance · **Fix order:** 22
**Location:** `backend/src/modules/search/search.service.ts:23`

`description: { contains: query.q, mode: 'insensitive' }` compiles to `ILIKE '%q%'`, which cannot use a B-tree index — Postgres sequential-scans the user's transactions on every keystroke-debounced search. It is also the query behind the dashboard's recent-transactions card (which passes no `q`, so that case is fine). Combined with the `items: { some: { … } }` sub-filter for amount ranges, this will be the second-slowest endpoint after balances. Add a `pg_trgm` GIN index on `description`, or move to a `tsvector` column with a GIN index if ranked full-text search is wanted. Also note `from`/`to` are not validated as `from <= to`, so an inverted range silently returns nothing rather than a 400.

## REL-04 — Prisma errors are flattened to 400, masking outages as client errors
**Severity:** MEDIUM · **Category:** Error handling · **Fix order:** 23
**Location:** `backend/src/common/filters/prisma-exception.filter.ts:35-41`

The filter maps P2002 → 409 and P2025 → 404 correctly, then sends **everything else** to 400:
```ts
default:
  this.logger.warn(`Unhandled Prisma error ${exception.code}: ${exception.message}`);
  response.status(HttpStatus.BAD_REQUEST).json({ message: 'Database request could not be processed' });
```
A foreign-key violation (P2003 — a server-side bug), a connection failure (P1001 — an outage), and a timeout (P2024 — pool exhaustion) all render as *"400: Database request could not be processed"*. The frontend's retry policy explicitly does **not** retry 400s (`query-client.ts:30`), so a transient database blip becomes a permanent-looking failure the user cannot retry past, and the log line is a `warn`, not an `error`, so it will not page anyone. Map P1xxx/P2024 to 503 (retryable), P2003 to 409 or 500, and log at `error` with the operation context.

## OBS-01 — Effectively no observability
**Severity:** MEDIUM · **Category:** Observability · **Fix order:** 24
**Location:** `backend/src/common/interceptors/logging.interceptor.ts:19-23`; absence of health/metrics/error reporting

The only logging is:
```ts
return next.handle().pipe(tap(() => {
  this.logger.log(`${method} ${url} ${Date.now() - startedAt}ms`);
}));
```
`tap` with a single function subscribes to `next` **only** — so failed requests are never logged at all, and neither status code, user id, nor a request/correlation id is recorded. There is no health endpoint (`GET /api/v1` returns `"Hello World!"`), no metrics, no tracing, no Sentry/equivalent on either side. Not logging request bodies is a deliberate and correct choice for financial data — but the result is that a production error is currently undiagnosable: you know a request happened, not that it failed or to whom. Add `tap({ next, error })`, a request id propagated from the BFF, `userId` on every line, structured JSON output (pino), `/health` (liveness + a Prisma `SELECT 1` readiness probe), and an error reporter on both apps.

## SEC-06 — Credentials can be created but never listed or revoked
**Severity:** MEDIUM · **Category:** Security / Access control · **Fix order:** 25
**Location:** `backend/src/modules/auth/auth.controller.ts:54-63` (create only); `backend/src/modules/oauth/` (no revocation endpoint); `frontend/web/app/(app)/connect/page.tsx`

`POST /auth/api-keys` mints a key. There is **no** `GET /auth/api-keys`, no `DELETE /auth/api-keys/:id`, and no UI for either — the `ApiKey.revokedAt` column exists and is checked on every validation, but nothing can ever set it. Similarly, `OAuthGrant` rows are permanent (`hasGrant` silently skips the consent screen forever once approved) and the authorization server exposes no RFC 7009 revocation endpoint. The connect page tells users *"Revoke it any time from the client's connector settings"* — which revokes the client's copy of the token, not the server's grant.

Combined with SEC-03 (a connector token can mint an API key), a user who disconnects claude.ai may still have a live, invisible, non-expiring credential against their account. Add list/revoke endpoints and UI for API keys, a grants list with revoke, and `POST /oauth/revoke`.

## SEC-07 — Google sign-in: missing `email_verified` treated as verified, plus implicit account linking
**Severity:** MEDIUM · **Category:** Security / Authentication · **Fix order:** 26
**Location:** `backend/src/modules/auth/auth.service.ts:95-118`

Two issues in one flow:
```ts
claims.email_verified === false          // absent/undefined ⇒ passes
…
const byEmail = await this.prisma.user.findUnique({ where: { email } });
user = byEmail ? await this.prisma.user.update({ … data: { googleId } }) : …   // silent link
```
1. The verification check only rejects an **explicit** `false`. A token lacking the claim is accepted as verified.
2. A Google identity whose email matches an existing password account is **automatically linked** to it, with no confirmation and no notification to the account owner.

The exposure is bounded — the `aud` check means the token must be issued for this app's client id, and the code is exchanged server-to-server with the client secret, so an attacker must actually complete a Google sign-in with the victim's email address. That requires controlling a Google identity for that address, which for a Workspace domain owner is possible for any address on their domain. Require `claims.email_verified === true` explicitly, and either require the user to be signed in before linking or send a confirmation. *(The absence of JWKS signature verification is acceptable here and correctly justified in the code comment — the `id_token` arrives directly from Google's token endpoint over TLS.)*

## SEC-08 — User enumeration via login timing and registration conflicts
**Severity:** MEDIUM · **Category:** Security · **Fix order:** 27
**Location:** `backend/src/modules/auth/auth.service.ts:35-41`; `PrismaExceptionFilter` P2002 path

```ts
const user = await this.usersService.findByEmail(dto.email);
if (!user?.passwordHash || !(await bcrypt.compare(dto.password, user.passwordHash))) { … }
```
Short-circuit evaluation means `bcrypt.compare` (deliberately ~100 ms at cost 12) runs **only** for existing accounts. The response-time difference is trivially measurable. Separately, registering an existing email returns a 409 naming the conflicting field (*"A record with this email already exists"*), and Google-linked accounts have `passwordHash === null`, so password login against them is also distinguishably fast. Compare against a dummy hash when no user is found, and make registration return a uniform response (send a "this address is already registered" email rather than a 409). Worth fixing, not urgent — email addresses are semi-public and rate limiting (once REL-01 is fixed) blunts bulk enumeration.

## SEC-09 — OAuth endpoints return 500 on malformed input
**Severity:** MEDIUM · **Category:** API design / Error handling · **Fix order:** 28
**Location:** `backend/src/modules/oauth/oauth.controller.ts:42, 104, 129`

`register`, `consent` and `token` call `schema.parse(body)` directly instead of using `ZodValidationPipe`. An unhandled `ZodError` reaches Nest's default filter and becomes **500 Internal Server Error** — where RFC 6749 requires `400 { "error": "invalid_request" }`. OAuth clients treat 5xx as "the server is broken, retry later" rather than "fix your request", so a client sending a malformed token request will retry a permanently-failing call, and the error log fills with 500s that are actually client errors. Wrap all three with the pipe (or a dedicated OAuth exception filter that emits the RFC error shape).

## SEC-10 — Swagger UI is published unconditionally in production
**Severity:** MEDIUM · **Category:** Security / Information disclosure · **Fix order:** 29
**Location:** `backend/src/main.ts:23-32`

`SwaggerModule.setup('docs', app, document)` runs on every boot with no environment guard, publishing the complete API surface — every route, every Zod-derived request schema, every auth scheme — at `GET /docs` on a publicly tunneled host. This is reconnaissance material, not a vulnerability by itself, but it removes all guesswork from attacking the API. Guard it with `if (process.env.NODE_ENV !== 'production')`, or put it behind basic auth.

## DB-01 — OAuth and session tables grow without bound
**Severity:** MEDIUM · **Category:** Database · **Fix order:** 30
**Location:** `prisma/schema.prisma` — `AuthorizationCode`, `AuthSession`, `OAuthRefreshToken`, `OAuthClient`, `AnalyticsCache`

Nothing ever deletes expired rows. `AuthorizationCode` (60 s TTL) accumulates one row per authorize; `AuthSession` (600 s TTL) one per login bridge; `OAuthRefreshToken` one per *every* token refresh, forever, since rotation creates a new row and only marks the old one revoked; `OAuthClient` one per unauthenticated dynamic registration, which anyone may call; `AnalyticsCache` one per (user, month, account) combination. Expiry is enforced only by reading `expiresAt` at query time.

A single active MCP connector refreshing every 15 minutes writes ~35,000 `OAuthRefreshToken` rows per year. None is ever read after rotation except for reuse detection. Add a daily cleanup job (or `pg_cron`) deleting rows past `expiresAt` plus a grace window, add indexes on `expiresAt`, and expire unused `OAuthClient` registrations.

## DB-02 — Missing indexes for real query patterns
**Severity:** MEDIUM · **Category:** Database · **Fix order:** 31
**Location:** `prisma/schema.prisma`

Present and well-chosen: `Transaction @@index([userId, occurredAt])`, `[userId, categoryId]`, the recurrence cursor index, `TransactionItem @@index([userId, accountId, createdAt])`, `DraftTransaction [userId, status, createdAt]`.

Missing for queries that exist in the code:
- `TransactionItem.categoryId` — `CategoriesService.remove` counts by it, and category attribution joins on it.
- `Budget.userId` — no index at all (currently harmless: nothing queries `Budget`).
- `Goal.accountId` — `computeProgressAmount` filters on it via `TransactionItem.accountId`, which *is* covered, but `Goal` lookups by account are not.
- `AuthSession.expiresAt`, `AuthorizationCode.expiresAt`, `OAuthRefreshToken.expiresAt` — needed by the cleanup job in DB-01.
- `Category @@unique([userId, name, type])` with a nullable `userId`: Postgres treats `NULL`s as distinct, so **duplicate global categories are permitted** despite the constraint. Use a partial unique index (`WHERE "userId" IS NULL`) if global categories are ever seeded.

## ARCH-01 — Raw Prisma models are the API response contract
**Severity:** MEDIUM · **Category:** Architecture · **Fix order:** 32
**Location:** every controller — e.g. `transactions.service.ts:75-78`, `goals.service.ts:130-138`

Services return Prisma results directly; there are no response DTOs and no serialization layer. Consequences observed in this codebase, not hypothetical:
- **Every schema change is a silent breaking API change.** The hand-written `frontend/web/lib/types.ts` is the only contract, and it has already drifted three times (CONTRACT-01, CONTRACT-02, DATA-03).
- **Derived values get re-derived per client.** `transactionAmount` exists on the frontend precisely because the backend does not compute it — and it computes it wrongly (DATA-03).
- **Over-exposure.** `GET /transactions/:id` returns the full `items` array including internal `userId` on each item; `GoalsService.list` returns whole `Goal` rows including `archivedAt` and both period columns. Nothing sensitive leaks *today* (users only ever see their own rows), but the default is "expose everything new".
- **Serialization surprises.** `Decimal` → string and `Date` → ISO string are implicit, which is what produced CONTRACT-02.

Introduce response schemas (Zod `.transform()` or simple mappers) for at least the money-carrying endpoints, and generate the frontend types from them. Given the repo is already all-Zod, a shared `packages/contracts` exporting schemas + inferred types to both sides is a modest change with a large payoff.

## ARCH-02 — `CurrentUser` fails open when a guard is forgotten
**Severity:** MEDIUM · **Category:** Architecture / Security · **Fix order:** 33
**Location:** `backend/src/common/decorators/current-user.decorator.ts:4-6`

```ts
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthenticatedUser => ctx.switchToHttp().getRequest().user
);
```
The return type asserts `AuthenticatedUser`; the value is whatever `request.user` happens to be. On a route where `@UseGuards(JwtAuthGuard)` was omitted, that is `undefined` — and `user.id` then throws a TypeError (a 500, which is loud and therefore survivable). The dangerous variant is a service receiving `userId: undefined` and passing it to Prisma: **`where: { userId: undefined }` causes Prisma to drop the filter entirely**, returning every user's rows.

All current controllers do apply the guard — verified across all 12 — so this is latent, not live. But the entire multi-tenancy model rests on one decorator being present on every controller forever. Harden it: throw `UnauthorizedException` when `request.user` is missing, and consider a global `APP_GUARD` with an explicit `@Public()` opt-out so new routes are secure by default rather than by memory.

## ARCH-03 — Cron jobs are in-process and assume a single replica
**Severity:** MEDIUM · **Category:** Architecture / Deployment · **Fix order:** 34
**Location:** `backend/src/modules/transactions/recurring-transactions.cron.ts:22`, `backend/src/modules/goals/goals.service.ts:197`

`@nestjs/schedule` runs the job in **every** process that boots the module. The moment the backend scales to two replicas, every recurring transaction is generated twice (subject to DATA-02's missing unique constraint) and goal rollover runs concurrently (protected only by `@@unique([goalId, periodStart])` on the upsert, which happens to save it). Financial correctness should not depend on never scaling out. Either take an advisory lock at job start, or move scheduling to an external trigger (platform cron hitting an authenticated endpoint) so exactly one execution is structurally guaranteed.

## REL-05 — Goal rollover has no per-item error isolation
**Severity:** MEDIUM · **Category:** Reliability · **Fix order:** 35
**Location:** `backend/src/modules/goals/goals.service.ts:198-238`

`rolloverExpiredInstances` loops over every expired instance and then every recurring goal with **no try/catch** (unlike `RecurringTransactionsCron`, which does isolate per-item failures). One bad row — a goal whose `recurrenceUnit` is null despite `isRecurring` being true, which the non-null assertion `goal.recurrenceUnit!` at `:231` would crash on — aborts the entire run, for every user, silently until someone reads the logs. The failure is also an unhandled rejection inside a scheduled job, which in some Node configurations terminates the process. Wrap each iteration in try/catch and log with the goal id, matching the sibling cron.

## AI-01 — The "AI layer" is a regex stub that produces wrong financial data
**Severity:** MEDIUM · **Category:** Correctness / Product integrity · **Fix order:** 36
**Location:** `backend/src/modules/ai/ai.service.ts:19-36`

```ts
const amount = dto.input.match(/(\d+(?:[.,]\d+)?)/)?.[1]?.replace(',', '.') ?? '0';
const type = lower.includes('received') || lower.includes('income') || lower.includes('salary')
  ? INCOME : EXPENSE;
occurredAt: new Date().toISOString(),
confidenceScore: parsed.amount === '0' ? 0.25 : 0.72
```
Three concrete defects: the **first** number in the string is taken as the amount ("coffee at 3pm for 12 TND" → 3); `occurredAt` is always *now*, so a natural-language input can never record a past transaction; and the confidence score is a hardcoded literal presented to the user as *"AI confidence: 72%"* by `ConfidencePill`.

The README promises "AI-powered transaction parsing" and "natural language expense tracking". This is a placeholder, which is fine for a prototype — the problem is that it is indistinguishable from a real parser in the UI, it is wired to a live write path, and the one control that would catch its errors (the review form) is broken (DATA-01). Either wire a real model (via the MCP client that is already the primary interface, or a server-side LLM call), or label the confidence honestly and disable the endpoint. Do not ship a fabricated confidence score next to someone's money.

---

# LOW

## DEBT-01 — Dead modules with schema backing
`BudgetsService` is an empty class with a comment (`budgets.service.ts:3-6`); there is no controller, no repository access, and nothing reads the `Budget` table — which nonetheless exists in the schema, has a `categoryId` foreign key, and is counted by `CategoriesService.remove` (`categories.service.ts:42`), so it actively participates in blocking category deletion despite being unreachable. `NotificationsService.notifyBudgetAlert` is never called from anywhere. Either build it or delete both the module and the table.

## DEBT-02 — Scaffold code left in place
`AppController`/`AppService` serve `"Hello World!"` at `GET /api/v1` and are the sole subject of `app.controller.spec.ts` and the only e2e test (`test/app.e2e-spec.ts`, which boots the entire `AppModule` — requiring a live database and full env — to assert that string). Replace with a real health endpoint; the e2e harness is otherwise useful and should be pointed at something meaningful.

## DEBT-03 — Computed-but-unused fields
`savingsRate` is computed in `AnalyticsService` (`:54`), typed on the frontend (`types.ts:167`) and rendered nowhere. `User.settings.defaultCurrency` is read by the dashboard (`dashboard/page.tsx:21`) but the settings page only edits `displayName` — there is no UI to ever set it, so the code path is dead. `DraftTransaction.reason` in `types.ts:113` does not match the backend's `rejectionReason`, so rejection reasons never display. Small, but each is a place where a reader's model of the system diverges from reality.

## DEBT-04 — Money converted to `number` in the chart path
`monthly-summary.tsx:50` does `tryParse(item.amount)?.toNumber()` and `:92` renders `amount={String(s.value)}` — a round trip through a float, contradicting `lib/decimal.ts`'s stated invariant. Harmless at realistic magnitudes and the value is display-only, but it is the exact pattern the file header forbids, and it will be copied. Keep the Decimal string for display and derive a separate numeric field purely for the chart geometry.

## UX-02 — Dashboard account selection is not URL state
`DashboardBody` holds the selected account in `useState` (`:204`), so the selection is lost on reload, cannot be linked or bookmarked, and does not survive back-navigation. Moving it to a search param is a small change that also makes the server prefetch able to honor it.

## UX-03 — "Reveal" affordance on a public URL
`connect/page.tsx:87, 221` masks `NEXT_PUBLIC_MCP_URL` behind a show/hide toggle as though it were a secret. It is a public endpoint URL compiled into the client bundle. Harmless, but it teaches users that the URL is sensitive, which makes it *less* likely they will question a genuinely sensitive value later.

## DEBT-05 — Zod major-version split across the repo
The backend is on Zod 3, the frontend on Zod 4. Both are used correctly in isolation, but it forecloses the obvious fix for the contract-drift family (CONTRACT-01/02, DATA-03): a shared schema package. Align them when addressing ARCH-01.

## DEBT-06 — `shadcn` CLI shipped as a runtime dependency
`frontend/web/package.json` lists `shadcn` (a scaffolding CLI) under `dependencies`, as is `@tanstack/react-query-devtools`. Neither should be a production dependency. Move both to `devDependencies`.

## DEBT-07 — `.gitignore` hides the `tasks/` directory
`backend/.gitignore` ignores `/tasks`, which contains five design documents (`01-server-architecture-refactor.md`, `02-auth-separation.md`, `03-oauth-mcp-compliance.md`, `04-multi-tenant-isolation.md`, `05-tool-layer-hardening.md`) describing the intended architecture. These read as the most valuable onboarding material in the repository and they are excluded from version control. Commit them.
