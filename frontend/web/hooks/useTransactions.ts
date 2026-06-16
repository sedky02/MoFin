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
import type { Transaction, TransactionType } from "@/lib/types";
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

export interface CreateTransactionInput {
  type: TransactionType;
  description: string;
  amount: string;
  currency: string;
  occurredAt: string;
  fromAccountId?: string;
  toAccountId?: string;
  categoryId?: string;
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
