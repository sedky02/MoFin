"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { LatestAppReleases } from "@/lib/app-release";

/** The newest installable mobile builds; public, so it works on the landing page too. */
export function useAppRelease() {
  return useQuery({
    queryKey: ["app-release", "latest"],
    queryFn: () => api.get<LatestAppReleases>("/app/releases/latest"),
    staleTime: 300_000,
  });
}
