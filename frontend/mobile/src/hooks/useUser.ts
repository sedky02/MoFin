import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { userKeys } from "@/core/query-keys";
import { STALE } from "@/lib/query-client";
import type { User } from "@/core/types";
import { toast } from "@/lib/toast";
import { handleApiError } from "@/core/form-errors";

export function useUser() {
  return useQuery({
    queryKey: userKeys.me,
    queryFn: () => api.get<User>("/users/me"),
    staleTime: STALE.accounts,
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { displayName?: string; settings?: Record<string, unknown> }) =>
      api.patch<User>("/users/me", body),
    onSuccess: (user) => {
      // PATCH /users/me returns a partial user (no isDemo, expiresAt...): merge, never replace.
      queryClient.setQueryData<User>(userKeys.me, (prev) => (prev ? { ...prev, ...user } : user));
      queryClient.invalidateQueries({ queryKey: userKeys.me });
      toast.success("Settings saved.");
    },
    onError: (err) => handleApiError(err, { fallback: "Could not save settings." }),
  });
}
