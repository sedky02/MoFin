import { describe, expect, it } from "vitest";
import {
  formatMoneyInput,
  formatPeriodDate,
  interpretMoneyText,
  moneyInputHint,
  moneyInputPrefix,
  normalizeMoneyTyping,
  parseMoneyInput,
  pasteMoneyText,
} from "@/lib/format";

/** What a money field ends up holding after blur: normalise, then tidy. */
function blurred(raw: string, currency: string): string {
  const v = normalizeMoneyTyping(raw);
  return v === null ? raw : formatMoneyInput(v, currency);
}

describe("interpretMoneyText", () => {
  it.each([
    // [typed, value, ambiguous]
    ["1234", "1234", false],
    ["12,5", "12.5", false],
    ["12,50", "12.5", false],
    ["12.50", "12.5", false],
    ["1,234", "1234", true],
    ["1,234,567", "1234567", false],
    ["1.234.567", "1234567", false],
    ["1,23,45,678", "12345678", false],
    ["1.234,56", "1234.56", false],
    ["1,234.56", "1234.56", false],
    ["1 234,56", "1234.56", false],
    ["$1,234.56", "1234.56", false],
    ["1.234", "1.234", false],
    ["0,500", "0.5", false],
    ["1234,567", "1234.567", false],
    [",5", "0.5", false],
    ["12,", "12", false],
    ["1,234.", "1234", false],
    ["007", "7", false],
  ])("reads %j as %s", (raw, value, ambiguous) => {
    expect(interpretMoneyText(raw)).toEqual({ value, ambiguous });
  });

  it.each(["", ",", ".", "abc", "-5", "−5", "1,2,3", "1.2.3", "1,234,5", "1,234.567,89", "12,34.5"])(
    "rejects %j",
    (raw) => {
      expect(interpretMoneyText(raw)).toBeNull();
    },
  );

  it("keeps full precision on large amounts (no floats)", () => {
    expect(interpretMoneyText("12,345,678,901,234,567.89")?.value).toBe("12345678901234567.89");
  });
});

describe("typing then blurring", () => {
  it("1,234 typed key by key becomes 1234.00 USD and 1234.000 TND on blur", () => {
    // The field holds each prefix as typed; only the final text is normalised.
    let field = "";
    for (const key of "1,234") field += key;
    expect(field).toBe("1,234");
    expect(blurred(field, "USD")).toBe("1234.00");
    expect(blurred(field, "TND")).toBe("1234.000");
  });

  it.each([
    ["1,234,567", "USD", "1234567.00"],
    ["12,5", "USD", "12.50"],
    ["12.50", "USD", "12.50"],
    ["12,5", "TND", "12.500"],
    ["1.234,56", "EUR", "1234.56"],
  ])("%j in %s blurs to %s", (raw, currency, expected) => {
    expect(blurred(raw, currency)).toBe(expected);
  });

  it("leaves unreadable text as typed so validation can flag it", () => {
    expect(blurred("1,2,3", "USD")).toBe("1,2,3");
  });

  it("normalises every intermediate prefix of 1,234 without throwing", () => {
    expect(["1", "1,", "1,2", "1,23", "1,234"].map(normalizeMoneyTyping)).toEqual([
      "1",
      "1",
      "1.2",
      "1.23",
      "1234",
    ]);
  });
});

describe("pasteMoneyText", () => {
  it("normalises a clear paste: 1.234,56 -> 1234.56", () => {
    expect(pasteMoneyText("", 0, 0, "1.234,56")).toBe("1234.56");
    expect(blurred(pasteMoneyText("", 0, 0, "1.234,56"), "USD")).toBe("1234.56");
  });

  it("replaces the selection", () => {
    expect(pasteMoneyText("99", 0, 2, "€ 1.234,56")).toBe("1234.56");
    expect(pasteMoneyText("12", 2, 2, ",5")).toBe("12.5");
  });

  it("keeps ambiguous or unreadable pastes as pasted", () => {
    expect(pasteMoneyText("", 0, 0, "1,234")).toBe("1,234");
    expect(pasteMoneyText("", 0, 0, "1,2,3")).toBe("1,2,3");
  });
});

describe("moneyInputHint", () => {
  it("shows the reading of an ambiguous comma", () => {
    expect(moneyInputHint("1,234", "USD", "en-US")).toBe("= 1,234.00");
    expect(moneyInputHint("1,234", "TND", "en-US")).toBe("= 1,234.000");
    expect(moneyInputHint("1,234", undefined, "en-US")).toBe("= 1,234.00");
  });

  it("shows the rounded value when there are more decimals than the currency has", () => {
    expect(moneyInputHint("1.234", "USD", "en-US")).toBe("= 1.23");
    expect(moneyInputHint("1.234", "TND", "en-US")).toBeNull();
  });

  it("stays quiet for clear input", () => {
    for (const raw of ["", "1", "1,", "12,5", "12.50", "1,234,567", "1.234,56", "1,2,3"]) {
      expect(moneyInputHint(raw, "USD", "en-US")).toBeNull();
    }
  });
});

describe("parseMoneyInput", () => {
  it("reads raw text submitted before blur", () => {
    expect(parseMoneyInput("1,234")).toBe("1234");
    expect(parseMoneyInput("12,5")).toBe("12.5");
    expect(parseMoneyInput("1234.00")).toBe("1234");
  });

  it("rejects zero, negatives and malformed text", () => {
    for (const raw of ["", "0", "0,00", "-5", "abc", "1.2.3"]) {
      expect(parseMoneyInput(raw)).toBeNull();
    }
  });
});

describe("moneyInputPrefix", () => {
  it.each([
    ["USD", "$"],
    ["EUR", "€"],
    ["PLN", "zł"],
    ["TND", ""],
    ["CHF", ""],
    [undefined, ""],
  ])("%s → %j", (currency, prefix) => {
    expect(moneyInputPrefix(currency)).toBe(prefix);
  });
});

describe("formatPeriodDate", () => {
  it("reads a period's last instant as that day, whatever the local zone", () => {
    // 23:59:59.999Z is already the next day east of UTC; the period still ends on the 31st.
    expect(formatPeriodDate("2026-10-31T23:59:59.999Z")).toBe(formatPeriodDate("2026-10-31T00:00:00.000Z"));
    expect(formatPeriodDate("2026-10-31T23:59:59.999Z")).not.toBe(formatPeriodDate("2026-11-01T00:00:00.000Z"));
  });

  it("returns an unreadable value as-is", () => {
    expect(formatPeriodDate("not a date")).toBe("not a date");
  });
});
