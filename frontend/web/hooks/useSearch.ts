"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { searchKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import type { Paginated, Transaction } from "@/lib/types";

export interface SearchParams {
  q?: string;
  categoryId?: string;
  accountId?: string;
  from?: string;
  to?: string;
  minAmount?: string;
  maxAmount?: string;
  limit?: number;
}

function toQuery(params: SearchParams, offset: number) {
  const { limit = 25, ...rest } = params;
  return { ...rest, limit, offset };
}

/** Offset-paginated infinite search. Cursor = offset. */
export function useSearchTransactions(params: SearchParams) {
  return useInfiniteQuery({
    queryKey: searchKeys.list(params as Record<string, unknown>),
    queryFn: ({ pageParam }) =>
      api.get<Paginated<Transaction>>("/search/transactions", toQuery(params, pageParam)),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const nextOffset = lastPage.offset + lastPage.data.length;
      return nextOffset < lastPage.total ? nextOffset : undefined;
    },
    staleTime: STALE.transactions,
  });
}

/**
 * Page-number paginated search (the /search page uses numbered pages rather than
 * infinite scroll). `total` (from the backend) tells us whether a next page exists —
 * no more over-fetching a sentinel row, which also means `limit` can safely reach
 * the pagination schema's max (100) without silently exceeding it (limit + 1 used to).
 */
export function useSearchPage(params: SearchParams, page: number, limit: number) {
  const offset = (page - 1) * limit;
  return useQuery({
    queryKey: searchKeys.list({ ...params, _page: page, _limit: limit }),
    queryFn: async () => {
      const result = await api.get<Paginated<Transaction>>("/search/transactions", {
        ...stripEmpty(params),
        limit,
        offset,
      });
      return { rows: result.data, hasNext: offset + result.data.length < result.total, total: result.total };
    },
    staleTime: STALE.transactions,
    placeholderData: (prev) => prev, // keep prior page visible while loading the next
  });
}

function stripEmpty(params: SearchParams): SearchParams {
  const out: SearchParams = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}

/** Simple single-page fetch used for the dashboard's "recent 10". */
export function useRecentTransactions(limit = 10, accountId?: string) {
  return useQuery({
    queryKey: searchKeys.list({ recent: limit, accountId }),
    queryFn: async () => {
      const result = await api.get<Paginated<Transaction>>("/search/transactions", {
        limit,
        offset: 0,
        accountId,
      });
      return result.data;
    },
    staleTime: STALE.transactions,
  });
}
