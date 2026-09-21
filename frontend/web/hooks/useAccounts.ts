"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { accountKeys, ledgerKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import type { Account, AccountType, Paginated } from "@/lib/types";
import { toast } from "sonner";
import { handleApiError } from "@/lib/form-errors";

export type AccountListStatus = "active" | "archived" | "all";

// No infinite-scroll UI for accounts — a real user's account count never
// approaches this, so 100 (the backend's max page size) is effectively
// "everything" while the endpoint itself is never actually unbounded.
const ACCOUNTS_PAGE_SIZE = 100;

export function useAccounts(status: AccountListStatus = "active", enabled = true) {
  return useQuery({
    queryKey: accountKeys.list(status),
    queryFn: async () => {
      const result = await api.get<Paginated<Account>>("/accounts", {
        status,
        limit: ACCOUNTS_PAGE_SIZE,
        offset: 0,
      });
      return result.data;
    },
    staleTime: STALE.accounts,
    enabled,
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
    // Optimistically drop the account from the cached active list.
    onMutate: async (id) => {
      const key = accountKeys.list("active");
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Account[]>(key);
      queryClient.setQueryData<Account[]>(key, (old) => old?.filter((a) => a.id !== id));
      return { previous };
    },
    onError: (err, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(accountKeys.list("active"), ctx.previous);
      handleApiError(err, { fallback: "Could not archive account." });
    },
    onSuccess: () => toast.success("Account archived."),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: accountKeys.all });
      queryClient.invalidateQueries({ queryKey: ledgerKeys.all });
    },
  });
}

export function useRestoreAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch<Account>(`/accounts/${id}/restore`),
    // Optimistically drop the account from the cached archived list.
    onMutate: async (id) => {
      const key = accountKeys.list("archived");
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Account[]>(key);
      queryClient.setQueryData<Account[]>(key, (old) => old?.filter((a) => a.id !== id));
      return { previous };
    },
    onError: (err, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(accountKeys.list("archived"), ctx.previous);
      handleApiError(err, { fallback: "Could not restore account." });
    },
    onSuccess: () => toast.success("Account restored."),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: accountKeys.all });
      queryClient.invalidateQueries({ queryKey: ledgerKeys.all });
    },
  });
}
