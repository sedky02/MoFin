"use client";

import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  transactionKeys,
  ledgerKeys,
  analyticsKeys,
  searchKeys,
  goalKeys,
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

/** How long the toast after a create keeps its Undo and View buttons. */
export const UNDO_CREATE_MS = 10_000;

/**
 * Takes back a just-created transaction by soft-deleting it. A plain call rather
 * than a mutation, for the same reason as undoDelete: the toast outlives the form.
 */
async function undoCreate(queryClient: QueryClient, id: string): Promise<boolean> {
  try {
    await api.delete<void>(`/transactions/${id}`);
  } catch (err) {
    handleApiError(err, { fallback: "Could not undo this transaction." });
    return false;
  }
  invalidateMoney(queryClient);
  toast.success("Transaction removed.");
  return true;
}

/**
 * Records a transaction. The toast offers Undo (deletes it again; for a recurring
 * root that also stops the series) and View (opens it) for a few seconds.
 */
export function useCreateTransaction({
  onView,
  onUndone,
}: { onView?: (id: string) => void; onUndone?: (id: string) => void } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTransactionInput) =>
      api.post<Transaction>("/transactions", input),
    onSuccess: (tx) => {
      invalidateMoney(queryClient);
      toast.success("Transaction recorded.", {
        duration: UNDO_CREATE_MS,
        action: { label: "Undo", onClick: () => void undoCreate(queryClient, tx.id).then((ok) => ok && onUndone?.(tx.id)) },
        cancel: { label: "View", onClick: () => onView?.(tx.id) },
      });
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
      invalidateSeries(queryClient);
      toast.success("Recurring transaction updated.");
    },
    onError: (err) => handleApiError(err, { fallback: "Could not update recurring transaction." }),
  });
}

/** Holds an active series: nothing is generated until it's resumed. */
export function usePauseRecurringTransaction(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<Transaction>(`/transactions/${id}/recurring/pause`),
    onSuccess: () => {
      invalidateSeries(queryClient);
      toast.success("Recurring transaction paused.");
    },
    onError: (err) => handleApiError(err, { fallback: "Could not pause recurring transaction." }),
  });
}

/**
 * Picks a paused series up from its next date on or after today (what fell due
 * while paused is skipped). The API refuses with the reason while it still can't post.
 */
export function useResumeRecurringTransaction(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<Transaction>(`/transactions/${id}/recurring/resume`),
    onSuccess: () => {
      invalidateSeries(queryClient);
      toast.success("Recurring transaction resumed.");
    },
    onError: (err) => {
      // A refused resume records why on the series, which the panel then shows.
      invalidateSeries(queryClient);
      handleApiError(err, { fallback: "Could not resume recurring transaction." });
    },
  });
}

/** Stops future generation. Already-generated occurrences are left as-is. */
export function useCancelRecurringTransaction(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<Transaction>(`/transactions/${id}/recurring/cancel`),
    onSuccess: () => {
      invalidateSeries(queryClient);
      toast.success("Recurring transaction cancelled.");
    },
    onError: (err) => handleApiError(err, { fallback: "Could not cancel recurring transaction." }),
  });
}

/** A series edit, pause, resume or cancel moves no money, but the root's page and the lists (the Recurring view) show it. */
function invalidateSeries(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: transactionKeys.all });
  queryClient.invalidateQueries({ queryKey: searchKeys.all });
}

/** Every field of a transaction; its recurrence is edited separately (useUpdateRecurringTransaction). */
export type UpdateTransactionInput = Omit<CreateTransactionInput, "isRecurring" | "recurringInterval" | "recurringEndDate">;

/** An edit, delete or restore moves balances, analytics, goals and lists, like a create. */
function invalidateMoney(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: transactionKeys.all });
  queryClient.invalidateQueries({ queryKey: ledgerKeys.all });
  queryClient.invalidateQueries({ queryKey: analyticsKeys.all });
  queryClient.invalidateQueries({ queryKey: searchKeys.all });
  queryClient.invalidateQueries({ queryKey: goalKeys.all });
}

export function useUpdateTransaction(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateTransactionInput) => api.patch<Transaction>(`/transactions/${id}`, input),
    onSuccess: () => {
      invalidateMoney(queryClient);
      toast.success("Transaction updated.");
    },
    onError: (err) => handleApiError(err, { fallback: "Could not update transaction." }),
  });
}

/**
 * Restores a deleted transaction. A plain call rather than a mutation: Undo is
 * clicked in a toast, usually after the page that deleted it has gone, and a
 * mutation's per-call callbacks don't run once its component unmounts.
 */
async function undoDelete(queryClient: QueryClient, id: string): Promise<boolean> {
  try {
    await api.post<Transaction>(`/transactions/${id}/restore`);
  } catch (err) {
    handleApiError(err, { fallback: "Could not restore transaction." });
    return false;
  }
  invalidateMoney(queryClient);
  toast.success("Transaction restored.");
  return true;
}

/** How long the toast after a delete keeps its Undo button. */
export const UNDO_DELETE_MS = 10_000;

/**
 * Soft-deletes a transaction. The toast offers Undo for a few seconds, which
 * restores it and runs `onUndone` (e.g. to go back to its page).
 */
export function useDeleteTransaction({ onUndone }: { onUndone?: (id: string) => void } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/transactions/${id}`),
    onSuccess: (_data, id) => {
      invalidateMoney(queryClient);
      toast.success("Transaction deleted.", {
        duration: UNDO_DELETE_MS,
        action: {
          label: "Undo",
          onClick: () => {
            void undoDelete(queryClient, id).then((restored) => restored && onUndone?.(id));
          },
        },
      });
    },
    onError: (err) => handleApiError(err, { fallback: "Could not delete transaction." }),
  });
}
