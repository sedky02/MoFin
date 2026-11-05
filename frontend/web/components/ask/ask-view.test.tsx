// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AskView } from "@/components/ask/ask-view";
import { ApiClientError } from "@/lib/api";
import type { AiChatDetail, AiChatTurn } from "@/lib/types";

const mutateAsync = vi.fn();
let detail: { data?: AiChatDetail; isLoading: boolean; isError: boolean; error?: unknown } = {
  isLoading: false,
  isError: false,
};

vi.mock("@/hooks/useAiChat", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useAiChat")>("@/hooks/useAiChat");
  return {
    ...actual,
    useAiChatDetail: () => ({ ...detail, refetch: vi.fn() }),
    useSendChatMessage: () => ({ mutateAsync, isPending: false }),
    useAiChats: () => ({ data: { pages: [{ data: [], total: 0, limit: 30, offset: 0 }] }, isLoading: false }),
    useRenameChat: () => ({ mutate: vi.fn() }),
    useDeleteChat: () => ({ mutate: vi.fn() }),
  };
});

const box = () => screen.getByRole("textbox", { name: "Ask a question about your finances" });

const turn = (question: string, answer: string): AiChatTurn => ({
  chat: { id: "chat-1", title: question, createdAt: "", updatedAt: "" },
  messages: [
    { id: "q", role: "user", content: question, usedTools: [], charts: [], createdAt: "2026-11-05T10:00:00Z" },
    {
      id: "a",
      role: "assistant",
      content: answer,
      usedTools: ["get_monthly_summary"],
      charts: [],
      createdAt: "2026-11-05T10:00:01Z",
    },
  ],
});

describe("AskView", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/ask");
    Element.prototype.scrollIntoView = vi.fn();
    detail = { isLoading: false, isError: false };
  });
  afterEach(() => {
    cleanup();
    mutateAsync.mockReset();
  });

  it("welcomes a new chat with suggested questions", () => {
    render(<AskView />);
    expect(screen.getByRole("heading", { name: "Ask about your money" })).toBeTruthy();
    const suggestions = within(screen.getByRole("list", { name: "Suggested questions" })).getAllByRole("button");
    expect(suggestions).toHaveLength(4);
  });

  it("starts a chat with the first question and opens it in the URL", async () => {
    mutateAsync.mockResolvedValue(turn("Where did my money go?", "Mostly rent."));
    render(<AskView />);

    await userEvent.type(box(), "Where did my money go?{Enter}");

    expect(mutateAsync).toHaveBeenCalledWith({ chatId: null, content: "Where did my money go?" });
    expect(new URLSearchParams(window.location.search).get("chat")).toBe("chat-1");
  });

  it("asks a suggested question with one click", async () => {
    mutateAsync.mockResolvedValue(turn("q", "a"));
    render(<AskView />);
    await userEvent.click(screen.getByRole("button", { name: /Where did my money go this month/ }));
    expect(mutateAsync).toHaveBeenCalledWith({ chatId: null, content: "Where did my money go this month?" });
  });

  it("sends follow-ups to the open chat", async () => {
    window.history.replaceState(null, "", "/ask?chat=chat-1");
    detail = {
      isLoading: false,
      isError: false,
      data: { ...turn("First?", "First answer.").chat, messages: turn("First?", "First answer.").messages },
    };
    mutateAsync.mockResolvedValue(turn("And then?", "Then this."));
    render(<AskView />);

    expect(screen.getByText("First answer.")).toBeTruthy();
    expect(screen.getByText("monthly summary")).toBeTruthy();
    await userEvent.type(box(), "And then?{Enter}");
    expect(mutateAsync).toHaveBeenCalledWith({ chatId: "chat-1", content: "And then?" });
  });

  it("keeps the question on screen with the reason and a retry when the answer fails", async () => {
    mutateAsync
      .mockRejectedValueOnce(
        new ApiClientError(503, "The assistant is busy. Try again in a minute.", {
          statusCode: 503,
          message: "busy",
          code: "AI_UNAVAILABLE",
          retryAfterSeconds: 20,
        } as never),
      )
      .mockResolvedValueOnce(turn("How much?", "120 TND."));
    render(<AskView />);

    await userEvent.type(box(), "How much?{Enter}");

    expect(screen.getByText("How much?")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("about 20 seconds");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mutateAsync).toHaveBeenLastCalledWith({ chatId: null, content: "How much?" });
  });

  it("does not send an empty question, and Shift+Enter makes a new line", async () => {
    render(<AskView />);
    await userEvent.type(box(), "   {Enter}");
    expect(mutateAsync).not.toHaveBeenCalled();
    await userEvent.type(box(), "line one{Shift>}{Enter}{/Shift}line two");
    expect((box() as HTMLTextAreaElement).value).toBe("   line one\nline two");
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
