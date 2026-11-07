import { draftAmountInput, draftItemFormValues, draftItemsPayload } from "./draft-review";

describe("draftAmountInput", () => {
  it("keeps 3 decimals for a TND draft", () => {
    expect(draftAmountInput({ amount: "12.345", currency: "TND" })).toBe("12.345");
  });

  it("uses 2 decimals when the draft has no currency", () => {
    expect(draftAmountInput({ amount: "12.5", currency: "" })).toBe("12.50");
  });

  it("returns an empty field for a missing amount", () => {
    expect(draftAmountInput({ amount: "", currency: "TND" })).toBe("");
  });
});

describe("draftItemFormValues", () => {
  it("maps the lines to form values with the memo as description", () => {
    expect(
      draftItemFormValues({
        currency: "TND",
        items: [
          { amount: "3.5", categoryId: "food", memo: "milk" },
          { amount: "6", categoryId: null, memo: null },
        ],
      }),
    ).toEqual([
      { amountRaw: "3.500", categoryId: "food", description: "milk" },
      { amountRaw: "6.000", categoryId: undefined, description: "" },
    ]);
  });

  it("treats a missing or single line as unsplit", () => {
    expect(draftItemFormValues({ currency: "TND" })).toEqual([]);
    expect(draftItemFormValues({ currency: "TND", items: [{ amount: "5" }] })).toEqual([]);
  });
});

describe("draftItemsPayload", () => {
  it("sends parsed amounts and drops blank categories and memos", () => {
    expect(
      draftItemsPayload([
        { amountRaw: "3.500", categoryId: "food", description: " milk " },
        { amountRaw: "6.000", categoryId: "", description: "" },
      ]),
    ).toEqual([
      { amount: "3.5", categoryId: "food", memo: "milk" },
      { amount: "6", categoryId: undefined, memo: undefined },
    ]);
  });

  it("returns undefined for fewer than two lines", () => {
    expect(draftItemsPayload([])).toBeUndefined();
    expect(draftItemsPayload(undefined)).toBeUndefined();
  });
});
