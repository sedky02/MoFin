"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { handleApiError } from "@/lib/form-errors";
import { aiCredentialKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export type AiProviderId = "groq" | "openai" | "openrouter" | "gemini";

export interface AiProviderStatus {
  provider: AiProviderId;
  label: string;
  defaultModel: string;
  connected: boolean;
  /** The only part of a stored key that ever comes back. */
  last4: string | null;
  model: string | null;
  verifiedAt: string | null;
}

export interface AiCredentials {
  /** False when the server has no encryption key, so keys can't be stored. */
  available: boolean;
  /** null: the shared MoFin assistant answers. */
  activeProvider: AiProviderId | null;
  fallbackEnabled: boolean;
  providers: AiProviderStatus[];
}

export function useAiCredentials(enabled = true) {
  return useQuery({
    queryKey: aiCredentialKeys.all,
    queryFn: () => api.get<AiCredentials>("/ai/credentials"),
    staleTime: STALE.accounts,
    enabled,
  });
}

export function useSaveAiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ provider, apiKey, model }: { provider: AiProviderId; apiKey: string; model?: string }) =>
      api.put<AiCredentials>(`/ai/credentials/${provider}`, { apiKey, ...(model ? { model } : {}) }),
    onSuccess: (next) => {
      queryClient.setQueryData(aiCredentialKeys.all, next);
      toast.success("Key saved.");
    },
    onError: (err) => handleApiError(err, { fallback: "Could not save the key." }),
  });
}

export function useRemoveAiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (provider: AiProviderId) => api.delete<AiCredentials>(`/ai/credentials/${provider}`),
    onSuccess: (next) => {
      queryClient.setQueryData(aiCredentialKeys.all, next);
      toast.success("Key removed.");
    },
    onError: (err) => handleApiError(err, { fallback: "Could not remove the key." }),
  });
}

export function useUpdateAiPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: { activeProvider?: AiProviderId | null; fallbackEnabled?: boolean }) =>
      api.patch<AiCredentials>("/ai/credentials", patch),
    onSuccess: (next) => queryClient.setQueryData(aiCredentialKeys.all, next),
    onError: (err) => handleApiError(err, { fallback: "Could not save your choice." }),
  });
}
