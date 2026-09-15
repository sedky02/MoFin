# MoFin — Architecture & Data Model Review (Logical Design Only)

**Lens:** Senior Software Architect / Database Architect. Scope is business logic, workflow correctness, and data model soundness — **not** code style, library choice, or implementation quality, except where they reveal an actual logic/ownership/data-model defect.

Companion to the general technical audit in this folder (`00`–`05`); this document focuses purely on whether the application's *logical* design is sound, independent of how it's coded.

---

## 0. The domain, restated

MoFin models personal finance as a **derived-balance ledger**: `Transaction` is a business event with no amount of its own; `TransactionItem` rows (debit/credit legs against an `Account`) are the only source of money truth. On top of that sit three independent workflows — **AI draft → human approval → ledger write**, **recurring template → generated occurrences**, and **goal → periodic instance snapshots** — plus a hand-built OAuth authorization server for letting external AI agents act on the ledger. That's a coherent, non-trivial domain, and the ledger choice is the right one for it.

---

## Top 10 issues (by actual impact)

| # | Issue | Why it matters |
|---|---|---|
| 1 | Draft approval discards the user's edits (§2.1) | The core workflow — the entire reason drafts exist — doesn't do what it claims |
| 2 | `Transaction` is overloaded as both event and recurrence template (§3.1) | One row plays two incompatible roles; every recurring query has to know which |
| 3 | Recurring generation and draft approval aren't atomic with their state transition (§2.2) | Money can be duplicated or drafts permanently stuck — genuine data corruption |
| 4 | Category attribution rule is implemented three different ways (§4.1) | The same transaction reports a different category breakdown depending which screen you're on |
| 5 | `approve_draft_transaction` exists as an MCP tool (§2.3) | Collapses the "human approves" workflow into "AI approves its own output" |
| 6 | `Category` global/user duplication constraint is unenforceable (§3.2) | The schema *can* represent a state ("two identical global categories") the business rules forbid |
| 7 | Goal progress and analytics disagree on which date field defines "this month" (§4.2) | Two dashboards, two different numbers, same data |
| 8 | No transaction-level currency invariant in the schema (§3.3) | Nothing stops a transaction's legs from disagreeing in currency except application code remembering to check |
| 9 | `Budget` and `Notifications` are modeled but have no workflow behind them (§5) | A concept exists in the schema with no lifecycle — dead weight that looks alive |
| 10 | Ownership is enforced by convention (`where: { userId }`), not by the schema (§3.4) | The data model doesn't make cross-tenant leakage structurally impossible — it makes it "everyone remembered to check" |

---

## 1. How data actually moves (the workflows as built)

**Record a transaction.** Validate cross-field rules → validate category/account ownership and currency → shape ledger legs → one DB transaction creates `Transaction` + `TransactionItem[]` → emit event to invalidate the month's analytics cache. This is the one workflow that is fully and correctly modeled as atomic. It's also the simplest one, which is probably not a coincidence.

**AI draft → approval.** `DraftTransaction.parsedData` is a free-form JSON blob shaped like a transaction. A human is supposed to review and correct it in a form, then approval both (a) creates the real `Transaction` from *the approved data* and (b) flips the draft to `APPROVED`, linked 1:1 via `Transaction.draftId`.

**Recurring series.** `Transaction` doubles as a *template* (`isRecurring`, `recurringInterval`, `recurringStatus`, `nextOccurrenceAt`, `recurringAmount`, `recurringFromAccountId/ToAccountId`) and, simultaneously, as the *first real occurrence* (it has its own `TransactionItem`s). A daily cron reads templates whose `nextOccurrenceAt` has passed, creates a new `Transaction` with `parentTransactionId` pointing at the template, and advances the cursor.

**Goals.** A `Goal` is a rule (target, recurrence unit); a `GoalInstance` is one period's frozen snapshot (target-at-the-time, progress, status). Progress is recomputed live on every read by re-scanning `TransactionItem`s; a nightly job finalizes expired instances and opens the next one.

**MCP/OAuth.** A separate, well-modeled state machine (`AuthorizationCode` → `OAuthRefreshToken` with rotation/family revocation) sits beside the finance domain and is logically sound on its own terms — the OAuth data model is actually one of the better-designed parts of the schema. I won't re-litigate it here since the workflow itself is correct; it's not a finance-domain concern.

---

## 2. Critical design problems

### 2.1 The draft-approval workflow doesn't implement what it's modeled to do

**Current decision.** `DraftTransaction.parsedData` holds the AI's guess. The workflow is: user reviews, corrects fields in a form, submits the corrections with the approval call. The *service* method (`DraftTransactionsService.approve`) takes no override argument at all — it reads `draft.parsedData` and passes that, untouched, into `TransactionsService.create`.

**Why this matters architecturally, not just as a bug.** This isn't a wiring mistake to patch — it reveals that the workflow's state model is incomplete. `DraftTransaction` has exactly one place to hold transaction data (`parsedData`), and the workflow conflates two conceptually different things in that one field: *"what the AI proposed"* and *"what the user actually confirmed."* Once you approve, those two are supposed to diverge (the user corrected something), but the schema has no second field to hold the divergence, and — because there's nowhere to put it — the approval code path never tries.

**Better model:** either (a) add `confirmedData Json?` alongside `parsedData`, populated at approval time and used as the actual creation input, preserving the original AI guess for audit/accuracy-tracking, or (b) treat approval as *always* mutating `parsedData` in place before the status flip, with the original raw text (`rawInput`) as the only permanently-preserved record of "what the AI actually saw." Either works; the current model — one mutable-in-intent field that's never actually mutated — doesn't.

**Recommend changing:** yes, this is the single most important fix. It also can't be fixed as a pure code change without a schema change, if you want the original AI proposal and the human-approved version both preserved for later "how good is the AI" analysis — which the confidence-score field suggests was intended.

### 2.2 Two workflows have a state transition that isn't atomic with the operation it depends on

**Recurring generation:** create the occurrence `Transaction`, *then* advance `nextOccurrenceAt` in a second write. **Draft approval:** create the `Transaction`, *then* flip `DraftStatus` in a second write.

**Why this is a data-model problem, not just an implementation one.** In both cases, the "cursor" (`nextOccurrenceAt`, `DraftStatus`) is the *only* thing that prevents the operation from being interpreted as "not yet done" and retried. Nothing in the schema ties the cursor's advancement to the existence of the row it's supposed to represent. Concretely:

- Recurring: if the cursor-advance fails, there is no unique constraint anywhere (`Transaction` has no `@@unique([parentTransactionId, occurredAt])`) stopping the next run from creating a *second* occurrence for the same date. The schema *permits* two `TransactionItem` sets representing the same real-world charge — an invalid state the business rules clearly don't want, and nothing enforces its impossibility.
- Draft: `Transaction.draftId` *is* unique, so a retried approval after a failed status-flip gets a constraint violation instead of a silent duplicate — better, but the draft is now stuck in `PENDING` forever with a real transaction already attached to it. The state machine has no path back from "transaction exists, but draft says PENDING."

**Better model:** the cursor and the fact-of-creation need to be the same atomic write (wrap both statements in one DB transaction — the codebase already threads a transaction client through the ledger-write path, so the seam exists), *and* the recurring case additionally needs the uniqueness constraint so the database — not application discipline — makes the duplicate state unrepresentable.

### 2.3 `approve_draft_transaction` as an agent-callable operation contradicts the workflow it's part of

**Current decision.** The draft/approval split exists specifically to put a human between "AI proposes" and "ledger records." The MCP tool surface exposes both `create_draft_transaction` *and* `approve_draft_transaction` to the same calling agent.

**Why it's a workflow logic problem, not a security add-on.** This isn't "the AI has too much access" in the abstract — it's that the state machine `PENDING → APPROVED` was designed to model a *human* action (that's the entire justification for having two states instead of one), and the system lets the same actor that creates the `PENDING` state also drive it to `APPROVED`. From a pure workflow-correctness standpoint, that's a state machine whose guard condition ("a human looked at this") is unenforceable, because the actor who's supposed to be gated by it is also the one allowed to satisfy it.

**Recommend changing:** yes — remove approval from the agent-callable surface entirely, or introduce a genuinely distinct state (e.g., `PROPOSED` for agent-visible, `PENDING` only reachable by a human-originated action) so the state machine's states actually correspond to who can be in them.

---

## 3. Database design evaluation

### 3.1 `Transaction` conflates "event" and "recurrence template" in one table

**Current decision.** A single `Transaction` row is either a normal event, or a normal event *plus* a recurrence template (when `isRecurring = true`), and the template fields (`recurringInterval`, `recurringStatus`, `nextOccurrenceAt`, `recurringAmount`, `recurringFromAccountId`, `recurringToAccountId`) sit alongside the event fields on the same row.

**Advantages:** simple to query "show me this transaction and its recurrence info" in one row; no join needed to render a recurring transaction's detail page; reuses the existing `Transaction`/`TransactionItem` machinery for the template's own first occurrence.

**Disadvantages / risk:** the table now represents two different concepts with different lifecycles. A template can be edited (`updateRecurring`) without touching the ledger-affecting fields of the same row that represents its *own* first occurrence — the schema comment even calls this out explicitly as something to be careful about ("kept separate from the root's own ledger-affecting fields"). That's a strong signal the concept wants to be two tables: a `RecurringRule` (interval, status, cursor, amount, accounts) that *produces* `Transaction` rows, versus a `Transaction` that is purely an event. As it stands, roughly a third of `Transaction`'s columns are `NULL` for the ~99% of rows that aren't recurring roots, and every query that just wants "give me this user's transactions" has to mentally filter out template-only semantics that happen to live in the same table.

**Recommend changing:** yes, if recurring transactions become a heavily-used feature — extracting a `RecurringRule` model would let a root's own transaction be an ordinary `Transaction` with `parentTransactionId` set (just like every other occurrence), removing the special-cased "root vs. occurrence" distinction entirely. If recurring stays a minor feature, this is tolerable debt, not urgent.

### 3.2 The global/user category uniqueness rule doesn't hold as an invariant

**Current decision.** `Category` models both user-owned categories (`userId` set) and global/system categories (`userId = null`) in one table, with `@@unique([userId, name, type])` intended to prevent duplicate categories.

**Why the schema can represent an invalid state.** In every ANSI-SQL database including Postgres, `NULL` is not equal to `NULL` for uniqueness purposes — a composite unique constraint containing a nullable column does not deduplicate rows where that column is null. So `@@unique([userId, name, type])` enforces "no user has two categories named 'Groceries'" but does **not** enforce "there is only one global 'Groceries' category." The business rule (implied by the frontend's `isSystem` split) clearly wants global categories to be singular reference data; the schema, as written, cannot guarantee that.

**Recommend changing:** yes — either a partial unique index (`WHERE "userId" IS NULL`) if global categories stay in the same table, or split into `SystemCategory` (no `userId`, naturally unique) and `Category` (user-owned) if the two concepts diverge further (e.g., if global categories should ever be immutable/uneditable while user ones aren't — a rule the current single-table model has no way to express structurally).

### 3.3 Currency consistency is an application invariant, not a schema one

**Current decision.** `Transaction.currency`, `Account.currency`, and `TransactionItem.currency` are three independent string columns. The rule "a transaction's currency must match the currency of every account it touches" is enforced entirely in `LedgerService` before the write — nothing in the schema prevents inserting a `TransactionItem` whose `currency` disagrees with its `account.currency`, or with its own `transaction.currency`.

**Why this matters for a ledger specifically.** This is the kind of invariant a *ledger* system should be least willing to leave to application discipline, because a currency mismatch is silent (both are valid-looking 3-letter codes) and corrupts a balance computation that's already trusted as the single source of truth. There's no CHECK constraint, no generated column, no trigger — any future code path that writes a `TransactionItem` directly (a data migration, a bulk-import feature, a second service) can silently produce a maths-breaking row, and the derived balance for that account becomes wrong in a way that's very hard to detect after the fact (you'd need to notice the sum doesn't match a bank statement).

**Recommend changing:** worth a CHECK constraint or trigger tying `TransactionItem.currency` to its `account.currency` at the database level, precisely because the ledger's correctness *is* the product. This is one case where "the application already checks it" isn't good enough, given the cost of being wrong.

### 3.4 Multi-tenancy has no representation in the schema at all

**Current decision.** Every tenant-owned table has a `userId` column; every query is expected to filter by it in application code. There is no row-level security policy, no schema-enforced tenant boundary, nothing that makes "query without a userId filter" structurally impossible.

**Why this is a data-model observation, not just a code-review one.** The business rule "a user can never see another user's financial data" is arguably the single most important invariant in the entire system, and it is represented nowhere in the data model — it exists purely as a convention repeated at ~40 call sites. A data model that encoded this more strongly (Postgres RLS keyed on a session variable, for instance) would make the invariant hold *even if* a future service method forgets the filter. As built, the schema treats tenant isolation as an application concern rather than a data concern, for the one property where that distinction matters most.

**Recommend changing:** for a personal-finance product, yes — RLS or an equivalent schema-level enforcement is proportionate to how catastrophic a violation would be, and it's a property the database can guarantee much more cheaply than "review every future query."

### 3.5 Good decisions worth calling out explicitly

- **The no-stored-balance ledger.** Balances are always `SUM(CREDIT) - SUM(DEBIT)` over `TransactionItem`, never cached as a column on `Account`. This is exactly right for a finance domain — it makes "balance disagrees with history" structurally impossible, at the cost of read performance (a separate, non-architectural concern). Don't change this.
- **`GoalInstance` snapshotting instead of only storing the rule.** Freezing `targetAmount` per period on the instance, separate from the live `Goal.targetAmount`, correctly preserves history — if a user changes a goal's target mid-year, past periods still show what the target *was* at the time. This is a genuinely good "don't overwrite history" decision, and the service layer respects it (target updates only touch `IN_PROGRESS` instances). Keep it.
- **`Transaction.draftId` as a unique, nullable FK.** Correctly models "a transaction may have originated from a draft, but doesn't have to" as an optional 1:1, and the uniqueness is what accidentally saves the draft-approval retry case in §2.2 from silently duplicating the transaction (even though the draft's own state gets stuck). The relationship itself is well-chosen.
- **Category attribution falling back from item → transaction.** The *intent* behind `item.category ?? transaction.category` (pre-split transactions still attribute correctly after the splits feature was added) is the right way to handle a schema evolving under existing data — the problem (§4.1) is that only one of three consumers implements it.
- **PKCE + hashed, rotating, family-revocable OAuth tokens.** Outside the finance domain proper, but as a workflow/state-machine design it's sound: reuse of a rotated token revokes the whole family, which is the correct response to "this token was probably stolen."

---

## 4. Cross-cutting: architecture + data model together

### 4.1 One business rule, three implementations, three different answers

"Which category does this money belong to" is computed three separate times, three separate ways: analytics falls back `item.category ?? transaction.category`; goals filter only on `transaction.category.type` (ignoring item-level categories, and **excluding** uncategorized money from a spending goal entirely rather than counting it); the transaction list just shows `items[0]`'s category. This isn't a "reviewers found the same bug three times" situation — it's a data-model tell: **category attribution is a derived business rule that has no single owner in the system.** Every consumer re-derives it against the raw `Transaction`/`TransactionItem` join because there's no place in the architecture whose job is to answer that question once. The fix isn't "make the three implementations agree" — it's recognizing that a system with this much event/item duplication in its money model needs a canonical read-path for "what category, what amount" that everything else consumes, rather than three services independently reasoning about item-vs-transaction fallbacks.

### 4.2 The workflow disagrees with itself about what "this month" means

Goal progress windows are computed from `TransactionItem.createdAt` (when the row was inserted); analytics month-boundaries are computed from `Transaction.occurredAt` (when the money actually moved), and the two use different calendar math besides (local time vs. UTC). This is a case where **two workflows built on the same entity made an unstated, contradictory assumption about which timestamp is authoritative for "period membership."** A transaction entered today for a purchase last month satisfies the goal period differently than it satisfies the analytics period, on the same underlying row. The data model has two candidate timestamps and no declared answer for which one is the business-meaningful one — that ambiguity is what let two workflows diverge without either being "wrong" in isolation.

### 4.3 The draft's `parsedData` is schema-less by design, and that design choice is defensible — but incomplete

Storing the AI's proposal as a JSON blob rather than normalized columns is *correct* for this use case: the shape of "what an AI parser might produce" is inherently less stable than a first-class domain entity, and forcing it into strict columns early would make iterating on the parser painful. This is a case where I would **not** recommend "normalize it" just because normalization is usually better — the flexibility is earned here. The gap isn't the JSON-ness of it; it's that (per §2.1) the workflow around it never gives the *human's* correction a place to live that's distinct from the *machine's* guess.

---

## 5. Questionable decisions (not necessarily wrong)

- **`Budget` exists as a table with a real FK to `Category` (and is checked by category-deletion logic) but has no workflow behind it at all.** Either the intended budget-alerting feature should be built (the `Notifications` model's `notifyBudgetAlert` method suggests it was planned), or the concept should be removed until it is. Right now it's a data model commitment (with real referential-integrity consequences — it blocks category deletion) for a feature that doesn't exist yet. Not wrong to leave it, but worth a deliberate decision rather than default.
- **`Account.archivedAt` (soft delete) alongside hard `onDelete: Cascade`/`Restrict` relations that assume real deletion happens.** Since accounts are only ever soft-deleted through the API, the cascade/restrict behavior on `Goal.account` and `Transaction.recurringFromAccount/ToAccount` is currently untested by anything the application actually does — it only matters if something deletes an `Account` row directly (a migration, an admin tool). Worth deciding explicitly whether hard-deletion of accounts is ever a legitimate operation; if not, the FK behavior is moot but not wrong.
- **`AnalyticsCache` stored in Postgres rather than computed on demand or cached elsewhere.** Reasonable given there's no other cache infrastructure, but it does mean *derived* data (a cache) lives in the same store and same transactional boundary as *source-of-truth* data, with its own independent invalidation logic (`deleteMany` keyed on a string-prefix match on `cacheKey`) that has to be kept in sync by hand with every new dimension analytics might be sliced by (it currently handles year/month/account, and would need updating for any new slice). Not wrong for the current scale; worth watching as analytics grows.
- **Goal progress recomputed live on every read rather than incrementally maintained.** Correct today (small data volumes, and it guarantees goal progress can never drift from the ledger), but it's a deliberate trade of read cost for consistency-by-construction — the same "no stored balance" philosophy applied to goals. Worth knowing it was a choice, not an oversight, so nobody "fixes" it into a cached column later without noticing why it wasn't one.

---

## 6. Missing concepts

- **A first-class `RecurringRule` entity**, separate from `Transaction` (§3.1) — the clearest missing entity in the model.
- **A place for "the human-approved version" of a draft**, distinct from "the AI-proposed version" (§2.1) — the clearest missing *field*, not just a missing table.
- **A canonical "transaction amount / category" read model** that the UI, analytics, and goals all consume, instead of each re-deriving it (§4.1).
- **An explicit "which timestamp defines a period" decision**, encoded once rather than assumed independently by each period-based workflow (§4.2).
- **A currency-consistency invariant enforced at the data layer**, not just in `LedgerService` (§3.3).
- **Some notion of an audit/history record for approved-with-edits drafts** — if the product ever wants to answer "how accurate is the AI," there's currently no data path that would let it, because the correction, when it happens, overwrites nothing (it's discarded) rather than being preserved alongside the original.

## 7. Future risks as the system grows

- **The `Transaction`-as-template overload** (§3.1) will get more painful, not less, if recurring transactions grow more sophisticated (e.g., variable amounts, skip-a-period, multiple accounts) — every new template feature adds more nullable-for-99%-of-rows columns to the same table.
- **The three-implementations-of-category-attribution problem** (§4.1) will get a fourth and fifth implementation as more features read transaction data (a budgeting feature, an export feature), each plausibly getting it slightly differently, unless a canonical read path is introduced before that happens.
- **Convention-based tenant isolation** (§3.4) gets riskier with every new module added, because each one is a fresh opportunity for someone to write a query without the `userId` filter — the risk is proportional to surface area, and surface area only grows.
- **`AnalyticsCache`'s string-prefix invalidation** will need a new special case for every new way analytics gets sliced (by category, by currency, by goal) — it doesn't generalize.

---

## Recommended roadmap (correctness and data integrity first)

1. **Give draft approval a real "confirmed vs. proposed" data model** (§2.1) — this is a workflow-correctness fix with a required schema change, and it's the single highest-impact item here because it's the product's namesake safety mechanism.
2. **Make recurring generation and draft-approval status transitions atomic with the write they gate**, and add the missing uniqueness constraint on recurring occurrences (§2.2) — this is the difference between "can't happen" and "hasn't happened yet."
3. **Decide, once, what "this period" means** (which timestamp, which calendar) and have goals/analytics both consume it (§4.2).
4. **Extract a canonical category/amount attribution function** that analytics, goals, and the transaction list all call, rather than each re-deriving the rule (§4.1).
5. **Reconsider the MCP approval tool against the workflow's own stated purpose** (§2.3) — a modeling decision, not a bolt-on permission fix.
6. **Add the currency-consistency constraint at the database layer** (§3.3) and **fix the global-category uniqueness gap** (§3.2) — both are cases where the schema currently permits states the business rules already say shouldn't exist.
7. **Only then**, consider whether `Transaction`-as-template (§3.1) is worth splitting out — it's a real modeling smell but not causing incorrect data today, so it belongs after the items that can actually corrupt records.
8. **Decide the fate of `Budget`** (§5) — build it or remove it; a schema commitment with no workflow is worse than either extreme.
