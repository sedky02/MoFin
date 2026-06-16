"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { userKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import type { User } from "@/lib/types";
import { toast } from "sonner";
import { handleApiError } from "@/lib/form-errors";

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
      queryClient.setQueryData(userKeys.me, user);
      queryClient.invalidateQueries({ queryKey: userKeys.me });
      toast.success("Settings saved.");
    },
    onError: (err) => handleApiError(err, { fallback: "Could not save settings." }),
  });
}
