"use client";

import * as React from "react";
import type { UseQueryResult } from "@tanstack/react-query";

const subscribeNever = () => () => {};

/**
 * True while React hydrates server HTML (a full page load), false for components mounted by
 * client-side navigation; anything the server couldn't know reads as "not there yet".
 */
export function useHydrating(): boolean {
  return React.useSyncExternalStore(subscribeNever, () => false, () => true);
}

/**
 * A query result as the server rendered it (nothing loaded) until hydration ends, for queries the
 * shell also fetches and caches first, which would mismatch the page below.
 */
export function useHydrationSafe<T extends UseQueryResult<unknown, Error>>(query: T, enabled = true): T {
  const hydrating = useHydrating();
  if (!hydrating) return query;
  return {
    ...query,
    data: undefined,
    error: null,
    status: "pending",
    fetchStatus: enabled ? "fetching" : "idle",
    isLoading: enabled,
    isPending: true,
    isFetching: enabled,
    isSuccess: false,
    isError: false,
  } as T;
}
