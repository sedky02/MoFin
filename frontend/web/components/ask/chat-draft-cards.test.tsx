// @vitest-environment jsdom
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AssistantMessage } from "@/components/ask/ask-message";
import { DraftCard } from "@/components/drafts/draft-card";
import type { DraftTransaction } from "@/lib/types";

const approve = vi.fn().mockResolvedValue({});
const reject = vi.fn();
vi.mock("@/hooks/useDrafts", () => ({
  useApproveDraft: () => ({ mutateAsync: approve, isPending: false }),
  useRejectDraft: () => ({ mutate: reject, isPending: false }),
}));
vi.mock("@/hooks/useAccounts", () => ({
  useAccounts: () => ({ data: [{ id: "a1", name: "Checking", type: "BANK", currency: "TND" }] }),
}));
vi.mock("@/hooks/useCategories", () => ({ useCategories: () => ({ data: [] }) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const draft = (over: Partial<DraftTransaction> = {}): DraftTransaction => ({
  id: "d1",
  rawInput: "coffee 4.5",
  parsedData: {
    type: "EXPENSE",
    description: "Coffee",
    amount: "4.5",
    currency: "TND",
    occurredAt: "2026-11-05T10:00:00.000Z",
    fromAccountId: "a1",
  },
  confidenceScore: "0.9",
  status: "PENDING",
  source: "CHAT",
  createdAt: "2026-11-05T10:00:00.000Z",
  updatedAt: "2026-11-05T10:00:00.000Z",
  ...over,
});

const answerWith = (drafts: DraftTransaction[]) => (
  <ul>
    <AssistantMessage
      message={{
        id: "a",
        role: "assistant",
        content: "Drafted.",
        usedTools: ["create_draft_transaction"],
        charts: [],
        drafts,
        createdAt: "2026-11-05T10:00:00Z",
      }}
    />
  </ul>
);

describe("draft cards in an Ask answer", () => {
  it("shows a pending draft with Approve, Review & edit and Reject, and approves it", async () => {
    render(answerWith([draft()]));
    expect(screen.getByText("Coffee")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Review & edit/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Reject/ })).toBeTruthy();
    // The question is right above, so the card doesn't quote it, and a draft isn't something it "looked at".
    expect(screen.queryByText("“coffee 4.5”")).toBeNull();
    expect(screen.queryByText(/Looked at/)).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /^Approve/ }));
    expect(approve).toHaveBeenCalledWith({ id: "d1", edits: {} });
  });

  it("shows the final status, without buttons, once the draft was handled elsewhere", () => {
    render(answerWith([draft({ status: "REJECTED" })]));
    expect(screen.getByText("Rejected")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Approve/ })).toBeNull();
  });
});

describe("DraftCard source label", () => {
  it.each([
    [{ source: "COMPOSER" as const }, "From Drafts"],
    [{ source: "CHAT" as const }, "From Ask MoFin"],
    [{ source: "VOICE" as const }, "From Voice"],
    [{ source: "MCP" as const, sourceClient: "Claude" }, "From Claude"],
    [{ source: "MCP" as const, sourceClient: null }, "From Connected app"],
  ])("says where a %j draft came from", (over, label) => {
    render(<DraftCard draft={draft(over)} />);
    expect(screen.getByText(label)).toBeTruthy();
  });
});
