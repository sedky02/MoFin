---
name: tanstack-query-conventions
description: TanStack Query v5 conventions for MoFin — query-key factory, per-domain stale times, standard hook shapes, invalidation rules, infinite queries, optimistic updates, and Next.js 16 server prefetch with HydrationBoundary. Use for any hooks/*.ts file or query-key work.
---

# TanStack Query v5 conventions

## Query key factory — `lib/query-keys.ts`

Never use raw string keys. Typed builders only:

```ts
export const accountKeys = {
  all: ["accounts"] as const,
  balance: (id?: string) => [...accountKeys.all, "balance", id] as const,
};
```

Same pattern for `transactionKeys`, `draftKeys`, `categoryKeys`, `ledgerKeys`, `analyticsKeys`,
`searchKeys`.

## Stale times (set per-query)

| Domain        | staleTime |
|---------------|-----------|
| balances      | 30s       |
| transactions  | 2min      |
| accounts      | 5min      |
| categories    | 10min     |
| analytics     | 5min      |

Define a `QueryClient` singleton in `lib/query-client.ts` with sensible defaults; override
`staleTime` per hook.

## Standard hook shapes

`useAccounts()`, `useCreateAccount()`, `useUpdateAccount()`, `useArchiveAccount()` — and the
equivalent quartet for other domains. EVERY mutation hook calls
`queryClient.invalidateQueries` on the correct key sets in `onSuccess`/`onSettled`.

Draft approval invalidates ALL of: `draftKeys.all`, `transactionKeys.all`, `ledgerKeys.all`,
`analyticsKeys.all`.

## Infinite queries

`useInfiniteQuery` for `/draft-transactions` (PENDING list) and `/search`. The cursor is an
**offset**: `getNextPageParam` returns `prevOffset + limit` while a full page came back, else
`undefined`.

## Optimistic updates

For balance display after draft approval and for archive/approve/reject, use `onMutate` to
snapshot + write the optimistic cache, `onError` to roll back, `onSettled` to invalidate. In
components, React 19's `useOptimistic` drives the instant list/visual change.

## Next.js 16 server prefetch

Dashboard prefetches in a Server Component with `HydrationBoundary` + `prefetchQuery`:

```tsx
const qc = new QueryClient();
await Promise.all([
  qc.prefetchQuery({ queryKey: ledgerKeys.balance(), queryFn: ... }),
  // ...
]);
return <HydrationBoundary state={dehydrate(qc)}>{children}</HydrationBoundary>;
```

`cookies()` must be awaited before any server-side fetch. Do NOT use `"use cache"` on
user-specific data (balances, transactions, drafts) — `"use cache"` is shared across users.
All financial data stays dynamic (the default).

## Error handling

The proxy already handles `401` refresh. In hook/mutation error handlers:
- `429` → toast "Too many requests, try again shortly."
- `409` → toast with `error.message`.
- `400` validation → map `errors[]` to React Hook Form `setError()`.
