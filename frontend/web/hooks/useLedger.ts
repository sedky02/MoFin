"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ledgerKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import type { LedgerBalance } from "@/lib/types";

/**
 * Ledger-first balances — always fetched, never computed. 30s stale time.
 * key = currency (with accountId) or "<accountId>:<currency>" (without).
 */
export function useLedgerBalance(params?: { accountId?: string; currency?: string }) {
  const { accountId, currency } = params ?? {};
  return useQuery({
    queryKey: ledgerKeys.balance(accountId, currency),
    queryFn: () =>
      api.get<LedgerBalance[]>("/ledger/balance", { accountId, currency }),
    staleTime: STALE.balances,
  });
}
