"use client";

import * as React from "react";
import type { UseQueryResult } from "@tanstack/react-query";

const subscribeNever = () => () => {};

/**
 * True while React is hydrating server-rendered HTML (a full page load), false in a
 * component that a client-side navigation mounts. Whatever the server could not know
 * (data fetched in the browser) has to read as "not there yet" during hydration, or the
 * first client render differs from the HTML and React throws that tree away.
 */
export function useHydrating(): boolean {
  return React.useSyncExternalStore(subscribeNever, () => false, () => true);
}

/**
 * A query result as the server rendered it: nothing loaded yet, until hydration is done.
 * For queries the app shell also fetches. The shell hydrates first and caches them, so a
 * page below it would otherwise hydrate with data its server HTML never had. A query only
 * the page itself fetches doesn't need this: nothing has cached it by then. A disabled
 * query (`enabled` false) never loads on the server either, so it only loses its data.
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
