# MoFin Backend

MoFin is an AI-native personal finance backend built as a production-grade NestJS modular monolith. Module boundaries are intentionally service-oriented so the system can later be split into microservices without rewriting the domain model.

## Architecture

```text
src/
  app.module.ts
  main.ts
  common/
    decorators/current-user.decorator.ts
    events/domain-events.ts
    guards/jwt-auth.guard.ts
    guards/mcp-api-key.guard.ts
    types/authenticated-user.ts
  database/
    prisma.module.ts
    prisma.service.ts
  modules/
    auth/
    users/
    accounts/
    categories/
    transactions/
    draft-transactions/
    ledger/
    ai/
    mcp/
    analytics/
    notifications/
    search/
    budgets/
    goals/
prisma/
  schema.prisma
```

## Module Boundaries

- `AuthModule`: JWT access/refresh auth, registration/login, Google OAuth stub, MCP API key issuance and validation.
- `UsersModule`: profile and settings management.
- `AccountsModule`: user-owned accounts for cash, bank, savings, and crypto-style assets. Balances are not stored here.
- `CategoriesModule`: system and user categories for income and expenses.
- `TransactionsModule`: creates financial transactions and delegates immutable ledger item creation.
- `DraftTransactionsModule`: safety layer for AI/user input. Only approved drafts create real transactions.
- `LedgerModule`: source of truth for balances. Balances are computed from `transaction_items`.
- `AiModule`: converts natural language into structured draft transactions using a stub parser ready for LLM integration.
- `McpModule`: external AI tool layer. It calls internal services only and never accesses Prisma directly.
- `AnalyticsModule`: monthly summary, category breakdown, savings rate, and cached computed stats.
- `NotificationsModule`: event-driven notification skeleton for draft approval and budget alerts.
- `SearchModule`: transaction search with filters; Prisma schema includes a PostgreSQL `tsvector` column for full-text indexing migrations.
- `BudgetsModule` and `GoalsModule`: SaaS expansion skeletons.

## Critical Flow

```text
AI/User Input
  -> DraftTransactionsService.create()
  -> draft-transaction.created event
  -> user/MCP approves draft
  -> DraftTransactionsService.approve()
  -> TransactionsService.create()
  -> LedgerService.buildEntriesForCommand()
  -> LedgerService.createEntries()
  -> transaction.created event
  -> AnalyticsService invalidates monthly cache
```

## Ledger Rules

- Account balances are never directly mutated or stored as source of truth.
- `transactions` describe the business event.
- `transaction_items` are immutable ledger entries.
- Income creates a credit entry to an account.
- Expense creates a debit entry from an account.
- Transfer creates two entries: debit source account and credit destination account.

## MCP Tools

`POST /api/v1/mcp/tools/call` with `x-api-key` or `Bearer` API key:

- `create_draft_transaction`
- `approve_draft_transaction`
- `search_transactions`
- `get_balance`
- `get_monthly_summary`
- `list_accounts`

MCP is implemented in `McpController` and `McpService`. It depends on domain services and does not inject or call Prisma.

## Setup

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run build
```

Run migrations after configuring `DATABASE_URL`:

```bash
npm run prisma:migrate
```
