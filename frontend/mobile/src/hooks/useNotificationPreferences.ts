import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/api/client';
import { handleApiError } from '@/core/form-errors';
import { STALE } from '@/lib/query-client';

export interface NotificationPreferences {
  notifyMcpDrafts: boolean;
  notifyRecurring: boolean;
}

const KEY = ['notification-preferences'] as const;

export function useNotificationPreferences() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api.get<NotificationPreferences>('/notifications/preferences'),
    staleTime: STALE.accounts,
  });
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<NotificationPreferences>) =>
      api.patch<NotificationPreferences>('/notifications/preferences', patch),
    onSuccess: (next) => queryClient.setQueryData(KEY, next),
    onError: (err) => handleApiError(err, { fallback: 'Could not save your choice.' }),
  });
}
