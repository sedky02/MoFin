"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  transactionKeys,
  ledgerKeys,
  analyticsKeys,
  searchKeys,
} from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import type { RecurringInterval, Transaction, TransactionType } from "@/lib/types";
import { toast } from "sonner";
import { handleApiError } from "@/lib/form-errors";

export function useTransaction(id: string) {
  return useQuery({
    queryKey: transactionKeys.detail(id),
    queryFn: () => api.get<Transaction>(`/transactions/${id}`),
    staleTime: STALE.transactions,
    enabled: !!id,
  });
}

export interface CreateTransactionItemInput {
  amount: string;
  categoryId?: string;
  memo?: string;
}

export interface CreateTransactionInput {
  type: TransactionType;
  description: string;
  amount: string;
  currency: string;
  occurredAt: string;
  fromAccountId?: string;
  toAccountId?: string;
  categoryId?: string;
  /** Split the total across multiple category+amount line items. */
  items?: CreateTransactionItemInput[];
  /** Starts a recurring series from this transaction. Not allowed together with `items`. */
  isRecurring?: boolean;
  recurringInterval?: RecurringInterval;
  recurringEndDate?: string;
}

export function useCreateTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTransactionInput) =>
      api.post<Transaction>("/transactions", input),
    onSuccess: () => {
      // A new transaction moves balances, analytics, and search results.
      queryClient.invalidateQueries({ queryKey: transactionKeys.all });
      queryClient.invalidateQueries({ queryKey: ledgerKeys.all });
      queryClient.invalidateQueries({ queryKey: analyticsKeys.all });
      queryClient.invalidateQueries({ queryKey: searchKeys.all });
      toast.success("Transaction recorded.");
    },
    onError: (err) => handleApiError(err, { fallback: "Could not record transaction." }),
  });
}

/** Edits a recurring series' template. Only affects occurrences generated from now on. */
export interface UpdateRecurringTransactionInput {
  description?: string;
  amount?: string;
  categoryId?: string | null;
  fromAccountId?: string;
  toAccountId?: string;
  recurringInterval?: RecurringInterval;
  recurringEndDate?: string | null;
}

export function useUpdateRecurringTransaction(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateRecurringTransactionInput) =>
      api.patch<Transaction>(`/transactions/${id}/recurring`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: transactionKeys.all });
      toast.success("Recurring transaction updated.");
    },
    onError: (err) => handleApiError(err, { fallback: "Could not update recurring transaction." }),
  });
}

/** Stops future generation. Already-generated occurrences are left as-is. */
export function useCancelRecurringTransaction(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<Transaction>(`/transactions/${id}/recurring/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: transactionKeys.all });
      toast.success("Recurring transaction cancelled.");
    },
    onError: (err) => handleApiError(err, { fallback: "Could not cancel recurring transaction." }),
  });
}
