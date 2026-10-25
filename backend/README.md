# MoFin backend

NestJS modular monolith with Prisma and PostgreSQL. Setup, architecture and environment variables are in the [root README](../readme.md). This file covers backend specifics.

## Commands

```bash
npm run start:dev    # applies migrations, then starts with watch on :3000
npm run build
npm run start:prod   # applies migrations, then runs dist/main.js
npm test             # Jest unit tests
npm run test:e2e     # e2e tests; some need E2E_DATABASE_URL
npm run lint
npm run prisma:migrate   # create a new migration in development
```

Swagger UI is served at `/docs` in development. The API is under `/api/v1`.

## Modules

Under `src/modules/`: `auth`, `users`, `accounts`, `categories`, `transactions` (including recurring series), `draft-transactions`, `ledger`, `goals`, `analytics`, `search`, `export`, `mail`, `notifications`, `budgets`, `ai`, `mcp` and `oauth`.

`mcp` calls domain services only and never touches Prisma directly. `oauth` is the OAuth 2.1 authorization server used by MCP clients.

## Critical flow

```text
create draft -> user approves -> TransactionsService.create()
  -> LedgerService writes TransactionItem entries
  -> transaction.created event -> analytics cache invalidated
```

## Ledger rules

- Balances are computed from `transaction_items`. They are never stored.
- Income credits an account. Expense debits an account. A transfer debits the source and credits the destination.

## MCP tools

Served at `/api/v1/mcp`, authenticated with an OAuth 2.1 access token. Tools include `create_draft_transaction`, `search_transactions`, `get_balance`, `get_monthly_summary` and `list_accounts`. Check `src/modules/mcp/` for the current list.
