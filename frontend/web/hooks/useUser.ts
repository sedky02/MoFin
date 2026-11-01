"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { userKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import type { User } from "@/lib/types";
import { toast } from "sonner";
import { handleApiError } from "@/lib/form-errors";
import { useHydrationSafe } from "@/hooks/use-hydrating";

/**
 * The signed-in user. The server never has it (it is fetched through the browser's
 * session), but by the time a page below the app shell hydrates, the shell has already
 * fetched it. Reading it then would render something the server HTML doesn't have, so
 * during hydration it reads as "still loading", like the server rendered it (see
 * useHydrationSafe).
 */
export function useUser() {
  return useHydrationSafe(
    useQuery({
      queryKey: userKeys.me,
      queryFn: () => api.get<User>("/users/me"),
      staleTime: STALE.accounts,
    }),
  );
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { displayName?: string; settings?: Record<string, unknown> }) =>
      api.patch<User>("/users/me", body),
    onSuccess: (user) => {
      queryClient.setQueryData(userKeys.me, user);
      queryClient.invalidateQueries({ queryKey: userKeys.me });
      toast.success("Settings saved.");
    },
    onError: (err) => handleApiError(err, { fallback: "Could not save settings." }),
  });
}
