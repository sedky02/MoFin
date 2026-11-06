// Golden money strings, run in Node (en-US ICU) and meant to be rendered on a device to confirm
// Hermes' Intl agrees. If only Hermes fails, fix a fallback, not these strings.
import { currencyFractionDigits, currencySymbol, formatMoney, formatMoneyInput } from "@/core/format";
import { GOLDEN_MONEY } from "@/core/golden-money";
import { CURRENCIES } from "@/core/constants";
import { CURRENCY_NAME_TABLE, currencyName } from "@/core/currency-names";

describe("golden money strings", () => {
  it.each(GOLDEN_MONEY)("formatMoney(%s, %s, compact=%s) is %s", (amount, currency, compact, expected) => {
    expect(formatMoney(amount, currency, { compact })).toBe(expected);
  });

  it("fails visibly on an unparseable amount", () => {
    expect(formatMoney("abc", "USD")).toBe("abc");
  });

  it("falls back to value + code for an unknown currency", () => {
    expect(formatMoney("5", "ZZZ9")).toBe("5 ZZZ9");
  });
});

describe("currency digits and symbols", () => {
  it.each([
    ["USD", 2],
    ["EUR", 2],
    ["JPY", 0],
    ["TND", 3],
    ["KWD", 3],
  ])("%s has %i fraction digits", (currency, digits) => {
    expect(currencyFractionDigits(currency)).toBe(digits);
  });

  it.each([
    ["USD", "$"],
    ["EUR", "€"],
    ["JPY", "¥"],
    ["TND", "TND"],
  ])("symbol of %s is %s", (currency, symbol) => {
    expect(currencySymbol(currency)).toBe(symbol);
  });

  it("formats money inputs with the currency's digits", () => {
    expect(formatMoneyInput("1250.5", "USD")).toBe("1250.50");
    expect(formatMoneyInput("1250.5", "TND")).toBe("1250.500");
    expect(formatMoneyInput("1250", "JPY")).toBe("1250");
  });
});

describe("currency names", () => {
  it("has a fallback name for every supported currency", () => {
    for (const code of CURRENCIES) expect(CURRENCY_NAME_TABLE[code]).toBeTruthy();
  });

  it("names common currencies", () => {
    expect(currencyName("USD")).toBe("US Dollar");
    expect(currencyName("EUR")).toBe("Euro");
    expect(currencyName("BTC")).toBe("Bitcoin");
  });

  it("uses the table when Intl.DisplayNames is missing", () => {
    const original = Intl.DisplayNames;
    Object.defineProperty(Intl, "DisplayNames", { value: undefined, configurable: true, writable: true });
    try {
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { currencyName: fresh } = require("@/core/currency-names");
        expect(fresh("TND")).toBe(CURRENCY_NAME_TABLE.TND);
        expect(fresh("ZZZ")).toBe("ZZZ");
      });
    } finally {
      Object.defineProperty(Intl, "DisplayNames", { value: original, configurable: true, writable: true });
    }
  });
});
