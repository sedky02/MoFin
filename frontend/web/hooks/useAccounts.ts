"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { accountKeys, ledgerKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import type { Account, AccountType } from "@/lib/types";
import { toast } from "sonner";
import { handleApiError } from "@/lib/form-errors";

export function useAccounts() {
  return useQuery({
    queryKey: accountKeys.all,
    queryFn: () => api.get<Account[]>("/accounts"),
    staleTime: STALE.accounts,
  });
}

export interface CreateAccountInput {
  name: string;
  type: AccountType;
  currency: string;
  metadata?: Record<string, unknown>;
}

export function useCreateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAccountInput) => api.post<Account>("/accounts", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountKeys.all });
      toast.success("Account created.");
    },
    onError: (err) => handleApiError(err, { fallback: "Could not create account." }),
  });
}

export interface UpdateAccountInput {
  id: string;
  name?: string;
  type?: AccountType;
  metadata?: Record<string, unknown>;
}

export function useUpdateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateAccountInput) =>
      api.patch<Account>(`/accounts/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountKeys.all });
      toast.success("Account updated.");
    },
    onError: (err) => handleApiError(err, { fallback: "Could not update account." }),
  });
}

export function useArchiveAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/accounts/${id}`),
    // Optimistically drop the account from the cached list.
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: accountKeys.all });
      const previous = queryClient.getQueryData<Account[]>(accountKeys.all);
      queryClient.setQueryData<Account[]>(accountKeys.all, (old) =>
        old?.filter((a) => a.id !== id),
      );
      return { previous };
    },
    onError: (err, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(accountKeys.all, ctx.previous);
      handleApiError(err, { fallback: "Could not archive account." });
    },
    onSuccess: () => toast.success("Account archived."),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: accountKeys.all });
      queryClient.invalidateQueries({ queryKey: ledgerKeys.all });
    },
  });
}
