"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { analyticsKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import type { DailySeries, MonthlySeries, MonthlySummary } from "@/lib/types";

/** `currency` narrows an all-accounts summary to one currency (amounts can't be summed across them). */
export function useMonthlySummary(year: number, month: number, accountId?: string, currency?: string) {
  return useQuery({
    queryKey: analyticsKeys.monthly(year, month, accountId, currency),
    queryFn: () =>
      api.get<MonthlySummary>("/analytics/monthly-summary", { year, month, accountId, currency }),
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


/**
 * Income / expenses / closing balance per day for one currency, days counted in `timeZone`
 * (the dashboard's weekly chart). Paging keeps the previous week on screen while the next loads.
 */
export function useDailySeries(currency: string, from: string, days: number, timeZone: string, accountId?: string) {
  return useQuery({
    queryKey: analyticsKeys.daily(currency, from, days, timeZone, accountId),
    queryFn: () =>
      api.get<DailySeries>("/analytics/daily-series", { currency, from, days, tz: timeZone, accountId }),
    staleTime: STALE.analytics,
    placeholderData: (prev) => prev,
  });
}
