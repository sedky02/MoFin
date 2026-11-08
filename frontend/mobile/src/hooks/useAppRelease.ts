import { useQuery } from '@tanstack/react-query';

import { api } from '@/api/client';
import type { PublishedBuild } from '@/core/update-check';

export type LatestAppReleases = {
  android: (PublishedBuild & { notes: string[]; publishedAt: string; legacyUrl: string | null }) | null;
  ios: null;
};

/** The newest builds published outside the stores. Checked about hourly; a new one rarely lands more often. */
export function useAppRelease(enabled = true) {
  return useQuery({
    queryKey: ['app-release', 'latest'],
    queryFn: () => api.get<LatestAppReleases>('/app/releases/latest'),
    staleTime: 60 * 60_000,
    enabled,
  });
}
