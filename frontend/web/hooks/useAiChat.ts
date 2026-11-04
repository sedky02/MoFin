"use client";

import { useMutation } from "@tanstack/react-query";
import { api, ApiClientError } from "@/lib/api";
import type { AiChatMessage, AiChatReply } from "@/lib/types";

/** Sends the whole conversation, gets the assistant's next message back. */
export function useAiChat() {
  return useMutation({
    mutationFn: (messages: AiChatMessage[]) => api.post<AiChatReply>("/ai/chat", { messages }),
  });
}

/** What to tell the user when the assistant could not answer. */
export function chatErrorMessage(err: unknown): string {
  if (err instanceof ApiClientError) {
    if (err.status === 503) return err.message || "The assistant is unavailable right now.";
    if (err.status === 429) {
      return err.body && "code" in err.body && err.body.code === "DEMO_LIMIT"
        ? err.message
        : "You're sending messages too fast. Wait a moment and try again.";
    }
    if (err.status === 504) return "The assistant took too long. Try a simpler question.";
  }
  return "Something went wrong. Please try again.";
}
