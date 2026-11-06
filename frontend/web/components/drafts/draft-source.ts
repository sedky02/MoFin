import type { DraftTransaction } from "@/lib/types";

/**
 * Where a draft came from, as the inbox labels it: the Drafts page input, the Ask chat (typed or
 * spoken), or the connected app by name. Same labels as the mobile app.
 */
export function draftSourceLabel(draft: Pick<DraftTransaction, "source" | "sourceClient">): string {
  switch (draft.source) {
    case "CHAT":
      return "Ask MoFin";
    case "VOICE":
      return "Voice";
    case "MCP":
      return draft.sourceClient?.trim() || "Connected app";
    default:
      return "Drafts";
  }
}
