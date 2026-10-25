// @vitest-environment jsdom
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MoneyInput } from "@/components/common/money-input";

afterEach(cleanup);

/** Controlled MoneyInput, as the forms use it. Records every value it was given. */
function Harness({
  currency,
  large,
  allowNegative,
  seen,
}: {
  currency?: string;
  large?: boolean;
  allowNegative?: boolean;
  seen: string[];
}) {
  const [value, setValue] = React.useState("");
  return (
    <>
      <MoneyInput
        id="amount"
        value={value}
        onChange={(v) => {
          seen.push(v);
          setValue(v);
        }}
        currency={currency}
        large={large}
        allowNegative={allowNegative}
      />
      <button type="button">elsewhere</button>
    </>
  );
}

function setup(props: { currency?: string; large?: boolean; allowNegative?: boolean } = {}) {
  const seen: string[] = [];
  render(<Harness {...props} seen={seen} />);
  return { seen, input: screen.getByRole("textbox") as HTMLInputElement, user: userEvent.setup() };
}

describe("MoneyInput", () => {
  it.each([false, true])("keeps exactly what was typed until blur (large=%s)", async (large) => {
    const { seen, input, user } = setup({ currency: "USD", large });
    await user.click(input);
    const typed: string[] = [];
    for (const key of "1,234") {
      await user.keyboard(key);
      typed.push(input.value);
    }
    expect(typed).toEqual(["1", "1,", "1,2", "1,23", "1,234"]);
    expect(seen).toEqual(["1", "1,", "1,2", "1,23", "1,234"]);

    await user.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(input.value).toBe("1234.00");
  });

  it("shows a TND amount without the code drawn over it", () => {
    const { input } = setup({ currency: "TND" });
    // "TND" appears once, after the amount, and the field isn't padded for a prefix.
    expect(screen.getAllByText("TND")).toHaveLength(1);
    expect(input.className).toContain("pl-3");
    expect(input.className).not.toContain("pl-7");
  });

  it("keeps the symbol prefix for USD", () => {
    const { input } = setup({ currency: "USD" });
    expect(screen.getByText("$")).toBeTruthy();
    expect(input.className).toContain("pl-7");
  });

  it("tidies to the currency's decimals on blur (TND has 3)", async () => {
    const { input, user } = setup({ currency: "TND" });
    await user.type(input, "1,234");
    await user.tab();
    expect(input.value).toBe("1234.000");
  });

  it("shows the reading of an ambiguous value before blur, and drops it after", async () => {
    const { input, user } = setup({ currency: "USD" });
    await user.type(input, "1,23");
    expect(document.querySelector("[data-slot=money-input-hint]")).toBeNull();

    await user.keyboard("4");
    const hint = document.getElementById("amount-hint");
    expect(hint?.textContent).toMatch(/^= 1.234.00$/);
    expect(input.getAttribute("aria-describedby")).toContain("amount-hint");

    await user.tab();
    expect(input.value).toBe("1234.00");
    expect(hint?.textContent).toBe("");
  });

  it("normalises a paste with locale separators", async () => {
    const { input, user } = setup({ currency: "EUR" });
    await user.click(input);
    await user.paste("1.234,56");
    expect(input.value).toBe("1234.56");
    await user.tab();
    expect(input.value).toBe("1234.56");
  });

  it("keeps a leading minus when negatives are allowed, tidied to the currency", async () => {
    const { input, user } = setup({ currency: "TND", allowNegative: true });
    expect(input.getAttribute("inputmode")).toBe("text");
    await user.type(input, "-1250,5");
    await user.tab();
    expect(input.value).toBe("-1250.500");
  });

  it("leaves a minus unreadable when negatives aren't allowed", async () => {
    const { input, user } = setup({ currency: "USD" });
    expect(input.getAttribute("inputmode")).toBe("decimal");
    await user.type(input, "-5");
    await user.tab();
    expect(input.value).toBe("-5");
  });

  it("leaves unreadable text alone on blur", async () => {
    const { input, user } = setup({ currency: "USD" });
    await user.type(input, "1,2,3");
    await user.tab();
    expect(input.value).toBe("1,2,3");
  });
});
