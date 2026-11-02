// QueryClient factory + a singleton (no server rendering on mobile, so no dehydration). Stale times are set per-hook
// (see tanstack-query-conventions skill); these are conservative defaults.
import { QueryClient } from "@tanstack/react-query";
import { ApiClientError } from "@/api/client";

// Domain stale times (ms) — imported by hooks so the numbers live in one place.
export const STALE = {
  balances: 30_000,
  transactions: 120_000,
  accounts: 300_000,
  categories: 600_000,
  analytics: 300_000,
  // Progress is recomputed live from the ledger on every fetch, same volatility as balances.
  goals: 30_000,
} as const;

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE.transactions,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          // Don't retry auth/validation/conflict/rate-limit — only transient errors.
          if (error instanceof ApiClientError) {
            if ([400, 401, 403, 404, 409, 429].includes(error.status)) return false;
          }
          return failureCount < 2;
        },
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}
