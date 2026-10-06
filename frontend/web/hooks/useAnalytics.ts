"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { analyticsKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import type { MonthlySeries, MonthlySummary } from "@/lib/types";

export function useMonthlySummary(year: number, month: number, accountId?: string) {
  return useQuery({
    queryKey: analyticsKeys.monthly(year, month, accountId),
    queryFn: () =>
      api.get<MonthlySummary>("/analytics/monthly-summary", { year, month, accountId }),
    staleTime: STALE.analytics,
  });
}

/** Income / expenses / closing balance per month for one currency (server-cached). */
export function useMonthlySeries(currency: string, accountId?: string, months = 6) {
  return useQuery({
    queryKey: analyticsKeys.series(currency, months, accountId),
    queryFn: () => api.get<MonthlySeries>("/analytics/monthly-series", { currency, months, accountId }),
    staleTime: STALE.analytics,
  });
}
