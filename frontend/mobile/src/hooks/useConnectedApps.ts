import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { api } from "@/api/client";
import { handleApiError } from "@/core/form-errors";
import { connectedAppKeys } from "@/core/query-keys";
import { STALE } from "@/lib/query-client";
import type { ConnectedApp } from "@/core/types";

export function useConnectedApps(enabled = true) {
  return useQuery({
    queryKey: connectedAppKeys.all,
    queryFn: () => api.get<ConnectedApp[]>("/oauth/grants"),
    staleTime: STALE.accounts,
    enabled,
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
