"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api";
import { aiChatKeys, draftKeys } from "@/lib/query-keys";
import type { AiChatDetail, AiChatSummary, AiChatTurn, Paginated } from "@/lib/types";
import { deviceTimeZone } from "@/lib/week";

const PAGE = 30;

export function useAiChats() {
  return useInfiniteQuery({
    queryKey: aiChatKeys.list(),
    queryFn: ({ pageParam }) =>
      api.get<Paginated<AiChatSummary>>("/ai/chats", {
        limit: PAGE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (last) => {
      const next = last.offset + last.data.length;
      return next < last.total ? next : undefined;
    },
    staleTime: 30_000,
  });
}

export function useAiChatDetail(id: string | null) {
  return useQuery({
    queryKey: aiChatKeys.detail(id ?? "new"),
    queryFn: () => api.get<AiChatDetail>(`/ai/chats/${id}`),
    enabled: Boolean(id),
    staleTime: 60_000,
  });
}

/**
 * The server saves question and answer together and returns both, so the chat cache is updated in
 * place instead of refetched.
 */
export function useSendChatMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, content }: { chatId: string | null; content: string }) =>
      api.post<AiChatTurn>(chatId ? `/ai/chats/${chatId}/messages` : "/ai/chats", {
        content,
        // "This month" and "today" are read in the user's zone, not the server's.
        timeZone: deviceTimeZone(),
      }),
    onSuccess: (turn) => {
      queryClient.setQueryData<AiChatDetail>(aiChatKeys.detail(turn.chat.id), (old) => ({
        ...turn.chat,
        messages: [...(old?.messages ?? []), ...turn.messages],
      }));
      queryClient.invalidateQueries({ queryKey: aiChatKeys.list() });
      // New drafts from this answer: the inbox and its pending badge catch up straight away.
      if (turn.messages.some((m) => m.drafts?.length)) queryClient.invalidateQueries({ queryKey: draftKeys.all });
    },
  });
}

export function useRenameChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      api.patch<AiChatSummary>(`/ai/chats/${id}`, { title }),
    onSuccess: (chat) => {
      queryClient.setQueryData<AiChatDetail>(aiChatKeys.detail(chat.id), (old) =>
        old ? { ...old, title: chat.title } : old,
      );
      queryClient.invalidateQueries({ queryKey: aiChatKeys.list() });
    },
    onError: () => toast.error("Couldn't rename the chat. Try again."),
  });
}

export function useDeleteChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/ai/chats/${id}`),
    onSuccess: (_void, id) => {
      queryClient.removeQueries({ queryKey: aiChatKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: aiChatKeys.list() });
      toast.success("Chat deleted.");
    },
    onError: () => toast.error("Couldn't delete the chat. Try again."),
  });
}

export function chatErrorMessage(err: unknown): string {
  if (err instanceof ApiClientError) {
    const code = err.body && "code" in err.body ? err.body.code : undefined;
    if (err.status === 503) {
      const wait = err.body && "retryAfterSeconds" in err.body ? Number(err.body.retryAfterSeconds) : undefined;
      const base = err.message || "The assistant is unavailable right now.";
      return wait && wait > 0 && wait <= 300 ? `${base} You can try again in about ${wait} seconds.` : base;
    }
    if (err.status === 502) return err.message || "The assistant couldn't answer because of a problem on our side.";
    if (err.status === 429) {
      return code === "DEMO_LIMIT" ? err.message : "You're sending messages too fast. Wait a moment and try again.";
    }
    if (err.status === 400 && code === "CHAT_FULL") return err.message;
    if (err.status === 404) return "This chat no longer exists. Start a new one.";
    if (err.status === 504) return "The assistant took too long. Try a simpler question.";
  }
  return "Something went wrong. Please try again.";
}
