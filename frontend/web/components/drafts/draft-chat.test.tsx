// @vitest-environment jsdom
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DraftChat } from "@/components/drafts/draft-chat";
import { ApiClientError } from "@/lib/api";

const mutateAsync = vi.fn();
let isPending = false;
vi.mock("@/hooks/useAiChat", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useAiChat")>("@/hooks/useAiChat");
  return { ...actual, useAiChat: () => ({ mutateAsync, isPending }) };
});

const box = () => screen.getByRole("textbox", { name: "Ask a question about your finances" }) as HTMLTextAreaElement;

describe("DraftChat", () => {
  afterEach(() => {
    cleanup();
    mutateAsync.mockReset();
    isPending = false;
    // jsdom has no scrollIntoView
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("sends the question with Enter and shows the answer and what it looked at", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    mutateAsync.mockResolvedValue({ message: "You spent 120 TND on food.", usedTools: ["get_monthly_summary"] });
    render(<DraftChat />);

    await userEvent.type(box(), "Food this month?{Enter}");

    expect(mutateAsync).toHaveBeenCalledWith([{ role: "user", content: "Food this month?" }]);
    expect(await screen.findByText(/You spent 120 TND on food\./)).toBeTruthy();
    expect(screen.getByText("Looked at: monthly summary")).toBeTruthy();
    expect(box().value).toBe("");
  });

  it("sends the whole conversation on a follow-up", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    mutateAsync.mockResolvedValueOnce({ message: "First answer", usedTools: [] });
    mutateAsync.mockResolvedValueOnce({ message: "Second answer", usedTools: [] });
    render(<DraftChat />);

    await userEvent.type(box(), "one{Enter}");
    await screen.findByText(/First answer/);
    await userEvent.type(box(), "two{Enter}");

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));
    expect(mutateAsync.mock.calls[1][0]).toEqual([
      { role: "user", content: "one" },
      { role: "assistant", content: "First answer" },
      { role: "user", content: "two" },
    ]);
  });

  it("does not send on Shift+Enter", async () => {
    render(<DraftChat />);
    await userEvent.type(box(), "line one{Shift>}{Enter}{/Shift}line two");
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(box().value).toBe("line one\nline two");
  });

  it("shows the reason and gives the question back when the assistant is unavailable", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    mutateAsync.mockRejectedValue(new ApiClientError(503, "The assistant is busy. Try again in a minute."));
    render(<DraftChat />);

    await userEvent.type(box(), "hello{Enter}");

    expect((await screen.findByRole("alert")).textContent).toBe("The assistant is busy. Try again in a minute.");
    expect(box().value).toBe("hello");
  });

  it("fills the box with an example on click, without sending it", async () => {
    render(<DraftChat />);
    await userEvent.click(screen.getByRole("button", { name: "Am I on track with my goals?" }));
    expect(box().value).toBe("Am I on track with my goals?");
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("disables Ask while empty", () => {
    render(<DraftChat />);
    expect((screen.getByRole("button", { name: "Ask" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
