"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  draftKeys,
  transactionKeys,
  ledgerKeys,
  analyticsKeys,
} from "@/lib/query-keys";
import type {
  DraftTransaction,
  DraftStatus,
  ParsedTransactionData,
  Transaction,
} from "@/lib/types";
import { toast } from "sonner";
import { handleApiError } from "@/lib/form-errors";

const PAGE = 10;

/** Offset-paginated drafts for a given status. Cursor = offset. */
export function useDrafts(status: DraftStatus) {
  return useInfiniteQuery({
    queryKey: draftKeys.list(status),
    queryFn: ({ pageParam }) =>
      api.get<DraftTransaction[]>("/draft-transactions", {
        status,
        limit: PAGE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === PAGE ? allPages.length * PAGE : undefined,
    staleTime: 30_000,
  });
}

/** PENDING count for the sidebar nav badge. */
export function usePendingDraftCount() {
  return useQuery({
    queryKey: [...draftKeys.all, "pending-count"],
    queryFn: async () => {
      const list = await api.get<DraftTransaction[]>("/draft-transactions", {
        status: "PENDING",
        limit: 100,
        offset: 0,
      });
      return list.length;
    },
    staleTime: 30_000,
  });
}

/** NL input → AI parse → PENDING draft. */
export function useCreateDraftIntent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      input: string;
      defaultAccountId?: string;
      defaultCurrency?: string;
    }) => api.post<DraftTransaction>("/ai/transaction-intents", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: draftKeys.all });
    },
    onError: (err) => handleApiError(err, { fallback: "Could not parse that input." }),
  });
}

function invalidateAfterApproval(queryClient: ReturnType<typeof useQueryClient>) {
  // Draft approval ripples through transactions, balances, and analytics.
  queryClient.invalidateQueries({ queryKey: draftKeys.all });
  queryClient.invalidateQueries({ queryKey: transactionKeys.all });
  queryClient.invalidateQueries({ queryKey: ledgerKeys.all });
  queryClient.invalidateQueries({ queryKey: analyticsKeys.all });
}

export function useApproveDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    // Edited review-form fields are sent with the approval so corrections persist.
    mutationFn: ({
      id,
      edits,
    }: {
      id: string;
      edits?: Partial<ParsedTransactionData>;
    }) =>
      api.patch<{ draft: DraftTransaction; transaction: Transaction }>(
        `/draft-transactions/${id}/approve`,
        // Send corrections (if any) so the approved transaction reflects edits.
        edits && Object.keys(edits).length ? { parsedData: edits } : undefined,
      ),
    onSuccess: () => {
      toast.success("Draft approved — transaction recorded.");
      invalidateAfterApproval(queryClient);
    },
    onError: (err) => handleApiError(err, { fallback: "Could not approve draft." }),
  });
}

export function useRejectDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      api.patch<DraftTransaction>(`/draft-transactions/${id}/reject`, { reason }),
    onSuccess: () => {
      toast.success("Draft rejected.");
      queryClient.invalidateQueries({ queryKey: draftKeys.all });
    },
    onError: (err) => handleApiError(err, { fallback: "Could not reject draft." }),
  });
}
