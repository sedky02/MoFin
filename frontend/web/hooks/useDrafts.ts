"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  aiChatKeys,
  draftKeys,
  transactionKeys,
  ledgerKeys,
  analyticsKeys,
} from "@/lib/query-keys";
import type {
  DraftTransaction,
  DraftStatus,
  Paginated,
  ParsedTransactionData,
  Transaction,
} from "@/lib/types";
import { toast } from "sonner";
import { handleApiError } from "@/lib/form-errors";
import { deviceTimeZone } from "@/lib/week";

const PAGE = 10;

export function useDrafts(status: DraftStatus) {
  return useInfiniteQuery({
    queryKey: draftKeys.list(status),
    queryFn: ({ pageParam }) =>
      api.get<Paginated<DraftTransaction>>("/draft-transactions", {
        status,
        limit: PAGE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const nextOffset = lastPage.offset + lastPage.data.length;
      return nextOffset < lastPage.total ? nextOffset : undefined;
    },
    staleTime: 30_000,
  });
}

/** A single COUNT(*) via a dedicated endpoint; fetching rows and counting capped the badge at 100. */
export function usePendingDraftCount() {
  return useQuery({
    queryKey: [...draftKeys.all, "pending-count"],
    queryFn: async () => {
      const { count } = await api.get<{ count: number }>("/draft-transactions/pending-count");
      return count;
    },
    staleTime: 30_000,
  });
}

export function useCreateDraftIntent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      input: string;
      defaultAccountId?: string;
      defaultCurrency?: string;
      // The browser's zone, so "yesterday" is the user's yesterday.
    }) => api.post<DraftTransaction[]>("/ai/transaction-intents", { ...body, timeZone: deviceTimeZone() }),
    onSuccess: (drafts) => {
      queryClient.invalidateQueries({ queryKey: draftKeys.all });
      if (drafts.length > 1) toast.success(`${drafts.length} drafts created. Review each one below.`);
    },
    onError: (err) => handleApiError(err, { fallback: "Could not parse that input." }),
  });
}

/**
 * The inbox and chat show the same drafts, so a decision in one refreshes both, also on failure: a
 * draft handled elsewhere then shows its real status instead of dead buttons.
 */
function refreshDraftViews(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: draftKeys.all });
  queryClient.invalidateQueries({ queryKey: aiChatKeys.all });
}

function invalidateAfterApproval(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: draftKeys.all });
  queryClient.invalidateQueries({ queryKey: transactionKeys.all });
  queryClient.invalidateQueries({ queryKey: ledgerKeys.all });
  queryClient.invalidateQueries({ queryKey: analyticsKeys.all });
}

export function useApproveDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      edits,
    }: {
      id: string;
      edits?: Partial<ParsedTransactionData>;
    }) =>
      api.patch<{ draft: DraftTransaction; transaction: Transaction }>(
        `/draft-transactions/${id}/approve`,
        edits && Object.keys(edits).length ? { parsedData: edits } : undefined,
      ),
    onSuccess: ({ transaction }) => {
      toast.success("Draft approved — transaction recorded.", {
        action: transaction?.id
          ? { label: "View", onClick: () => window.location.assign(`/transactions/${transaction.id}`) }
          : undefined,
      });
      invalidateAfterApproval(queryClient);
    },
    onError: (err) => handleApiError(err, { fallback: "Could not approve draft." }),
    onSettled: () => refreshDraftViews(queryClient),
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
    onSettled: () => refreshDraftViews(queryClient),
  });
}
