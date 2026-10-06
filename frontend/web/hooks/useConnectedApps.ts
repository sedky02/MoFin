"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { handleApiError } from "@/lib/form-errors";
import { connectedAppKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import type { ConnectedApp } from "@/lib/types";

export function useConnectedApps() {
  return useQuery({
    queryKey: connectedAppKeys.all,
    queryFn: () => api.get<ConnectedApp[]>("/oauth/grants"),
    staleTime: STALE.accounts,
  });
}

/** Revokes the app's consent and refresh tokens server-side (not just in the client). */
export function useDisconnectApp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (clientId: string) => api.delete<{ revoked: boolean }>(`/oauth/grants/${encodeURIComponent(clientId)}`),
    onSuccess: () => toast.success("App disconnected."),
    onError: (err) => handleApiError(err, { fallback: "Could not disconnect app." }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: connectedAppKeys.all }),
  });
}
