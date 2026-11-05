// @vitest-environment jsdom
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AskChart, axisLabel } from "@/components/ask/ask-chart";
import { groupChats } from "@/components/ask/ask-chat-list";
import { RichText } from "@/components/ask/ask-message";
import { chatErrorMessage } from "@/hooks/useAiChat";
import { ApiClientError } from "@/lib/api";
import type { AiChart } from "@/lib/types";

afterEach(cleanup);

describe("RichText", () => {
  it("renders paragraphs, bullet lists and bold, and never HTML", () => {
    const { container } = render(
      <RichText text={"You spent **120 TND**.\n\n- Rent: 800\n- Food: 120\n\n<img src=x onerror=alert(1)>"} />,
    );
    expect(container.querySelector("strong")?.textContent).toBe("120 TND");
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Rent: 800", "Food: 120"]);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it("renders numbered lists", () => {
    render(<RichText text={"1. First\n2. Second"} />);
    expect(screen.getByRole("list").tagName).toBe("OL");
  });
});

describe("axisLabel", () => {
  it("formats months and days, and leaves categories alone", () => {
    expect(axisLabel("2026-10", "month", false, "en-US")).toBe("Oct");
    expect(axisLabel("2026-10", "month", true, "en-US")).toBe("Oct 26");
    expect(axisLabel("2026-11-03", "day", false, "en-US")).toBe("Nov 3");
    expect(axisLabel("Food", "category")).toBe("Food");
  });
});

describe("AskChart", () => {
  const donut: AiChart = {
    kind: "donut",
    title: "Spending by category, November 2026",
    currency: "TND",
    axis: "category",
    labels: ["Rent", "Food"],
    series: [{ name: "Expenses", tone: "expense", values: ["800", "200"] }],
  };

  it("shows the title, a legend with shares, and a table for screen readers", () => {
    render(<AskChart chart={donut} />);
    expect(screen.getByText("Spending by category, November 2026")).toBeTruthy();
    expect(screen.getByText("Rent · 80%")).toBeTruthy();
    const table = screen.getByRole("table");
    expect(table.textContent).toContain("Rent");
    expect(table.textContent).toContain("Food");
  });

  it("draws bars with one column per label", () => {
    const bars: AiChart = {
      kind: "bar",
      title: "Income vs expenses, last 2 months",
      currency: "TND",
      axis: "month",
      labels: ["2026-10", "2026-11"],
      series: [
        { name: "Income", tone: "income", values: ["1000", "1000"] },
        { name: "Expenses", tone: "expense", values: ["700", "900"] },
      ],
    };
    render(<AskChart chart={bars} />);
    expect(screen.getAllByRole("row")).toHaveLength(3); // header + 2 months
    expect(screen.getAllByText("Income").length).toBeGreaterThan(0);
  });
});

describe("groupChats", () => {
  it("groups by when a chat was last active", () => {
    const now = new Date(2026, 10, 5, 12);
    const at = (d: number) => ({
      id: String(d),
      title: "t",
      createdAt: "",
      updatedAt: new Date(2026, 10, d, 9).toISOString(),
    });
    const groups = groupChats([at(5), at(4), at(1), at(-10)], now);
    expect(groups.map((g) => [g.label, g.chats.length])).toEqual([
      ["Today", 1],
      ["Yesterday", 1],
      ["Previous 7 days", 1],
      ["Earlier", 1],
    ]);
  });
});

describe("chatErrorMessage", () => {
  const err = (status: number, body: object, message = "msg") =>
    new ApiClientError(status, message, { statusCode: status, message, ...body } as never);

  it("explains each failure in plain words", () => {
    expect(chatErrorMessage(err(503, { code: "AI_UNAVAILABLE", retryAfterSeconds: 30 }, "Busy."))).toBe(
      "Busy. You can try again in about 30 seconds.",
    );
    expect(chatErrorMessage(err(502, { code: "AI_PROVIDER_ERROR" }, "Our side."))).toBe("Our side.");
    expect(chatErrorMessage(err(429, { code: "DEMO_LIMIT" }, "Demo cap."))).toBe("Demo cap.");
    expect(chatErrorMessage(err(429, {}))).toMatch(/too fast/);
    expect(chatErrorMessage(err(400, { code: "CHAT_FULL" }, "Full."))).toBe("Full.");
    expect(chatErrorMessage(err(404, {}))).toMatch(/no longer exists/);
    expect(chatErrorMessage(new Error("x"))).toMatch(/Something went wrong/);
  });
});
