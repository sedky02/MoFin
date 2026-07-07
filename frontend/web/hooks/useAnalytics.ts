"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { analyticsKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import type { MonthlySummary } from "@/lib/types";

export function useMonthlySummary(year: number, month: number, accountId?: string) {
  return useQuery({
    queryKey: analyticsKeys.monthly(year, month, accountId),
    queryFn: () =>
      api.get<MonthlySummary>("/analytics/monthly-summary", { year, month, accountId }),
    staleTime: STALE.analytics,
  });
}
