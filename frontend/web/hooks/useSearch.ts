"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { searchKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import type { Transaction } from "@/lib/types";

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
  const limit = params.limit ?? 25;
  return useInfiniteQuery({
    queryKey: searchKeys.list(params as Record<string, unknown>),
    queryFn: ({ pageParam }) =>
      api.get<Transaction[]>("/search/transactions", toQuery(params, pageParam)),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === limit ? allPages.length * limit : undefined,
    staleTime: STALE.transactions,
  });
}

/**
 * Page-number paginated search (the /search page uses numbered pages rather than
 * infinite scroll). We over-fetch one extra row to know if a next page exists.
 */
export function useSearchPage(params: SearchParams, page: number, limit: number) {
  const offset = (page - 1) * limit;
  return useQuery({
    queryKey: searchKeys.list({ ...params, _page: page, _limit: limit }),
    queryFn: async () => {
      const rows = await api.get<Transaction[]>("/search/transactions", {
        ...stripEmpty(params),
        limit: limit + 1, // sentinel row to detect a next page
        offset,
      });
      const hasNext = rows.length > limit;
      return { rows: hasNext ? rows.slice(0, limit) : rows, hasNext };
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
export function useRecentTransactions(limit = 10) {
  return useQuery({
    queryKey: searchKeys.list({ recent: limit }),
    queryFn: () =>
      api.get<Transaction[]>("/search/transactions", { limit, offset: 0 }),
    staleTime: STALE.transactions,
  });
}
