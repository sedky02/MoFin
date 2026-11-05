import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "@/api/client";
import {
  draftKeys,
  transactionKeys,
  ledgerKeys,
  analyticsKeys,
} from "@/core/query-keys";
import type {
  DraftTransaction,
  DraftStatus,
  Paginated,
  ParsedTransactionData,
  Transaction,
} from "@/core/types";
import { router, type Href } from "expo-router"; // the typed route exists from Phase 6
import { toast } from "@/lib/toast";
import { handleApiError } from "@/core/form-errors";
import { deviceTimeZone } from "@/core/week";

const PAGE = 10;
// A language model answers slower than the 15 s default allows.
const AI_TIMEOUT_MS = 60_000;

/** Offset-paginated drafts for a given status. Cursor = offset. */
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

/**
 * PENDING count for the sidebar nav badge — a single COUNT(*) via a
 * dedicated endpoint, not a fetch-up-to-100-rows-and-count-them hack (which
 * used to silently cap the badge at 100).
 */
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

/** NL input → AI parse → one PENDING draft per transaction found in the sentence. */
export function useCreateDraftIntent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      input: string;
      defaultAccountId?: string;
      defaultCurrency?: string;
      // The phone's zone, so "yesterday" is the user's yesterday.
    }) =>
      api.post<DraftTransaction[]>(
        "/ai/transaction-intents",
        { ...body, timeZone: deviceTimeZone() },
        { timeoutMs: AI_TIMEOUT_MS },
      ),
    onSuccess: (drafts) => {
      queryClient.invalidateQueries({ queryKey: draftKeys.all });
      if (drafts.length > 1) toast.success(`${drafts.length} drafts created. Review each one below.`);
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
    onSuccess: ({ transaction }) => {
      toast.success("Draft approved — transaction recorded.", {
        action: transaction?.id
          ? { label: "View", onClick: () => router.push(`/transactions/${transaction.id}` as Href) }
          : undefined,
      });
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
