import { describe, expect, it } from "vitest";
import { FORM_STASH_MAX_AGE_MS, stashForm, takeStashedForm } from "@/lib/form-stash";

function memoryStore(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, String(v)),
  };
}

const KEY = "test:form";
const T0 = 1_800_000_000_000;

describe("form stash", () => {
  it("returns what was stashed, once", () => {
    const store = memoryStore();
    stashForm(KEY, { description: "Coffee", amountRaw: "4.50" }, { now: T0, store });
    expect(takeStashedForm(KEY, { now: T0 + 1000, store })).toEqual({ description: "Coffee", amountRaw: "4.50" });
    expect(takeStashedForm(KEY, { now: T0 + 2000, store })).toBeUndefined();
    expect(store.length).toBe(0);
  });

  it("keeps one entry per key, the latest", () => {
    const store = memoryStore();
    stashForm(KEY, { amountRaw: "1" }, { now: T0, store });
    stashForm(KEY, { amountRaw: "2" }, { now: T0 + 10, store });
    expect(store.length).toBe(1);
    expect(takeStashedForm(KEY, { now: T0 + 20, store })).toEqual({ amountRaw: "2" });
  });

  it("ignores and clears a stash older than the max age", () => {
    const store = memoryStore();
    stashForm(KEY, { amountRaw: "1" }, { now: T0, store });
    expect(takeStashedForm(KEY, { now: T0 + FORM_STASH_MAX_AGE_MS + 1, store })).toBeUndefined();
    expect(store.length).toBe(0);
  });

  it("accepts a stash right at the max age", () => {
    const store = memoryStore();
    stashForm(KEY, { amountRaw: "1" }, { now: T0, store });
    expect(takeStashedForm(KEY, { now: T0 + FORM_STASH_MAX_AGE_MS, store })).toEqual({ amountRaw: "1" });
  });

  it("is 30 minutes by default", () => {
    expect(FORM_STASH_MAX_AGE_MS).toBe(30 * 60 * 1000);
  });

  it("rejects a stash from the future", () => {
    const store = memoryStore();
    stashForm(KEY, { amountRaw: "1" }, { now: T0 + 5000, store });
    expect(takeStashedForm(KEY, { now: T0, store })).toBeUndefined();
  });

  it("drops malformed entries", () => {
    const store = memoryStore();
    for (const raw of ["not json", "null", "{}", '{"savedAt":"x","values":{}}', `{"savedAt":${T0},"values":"str"}`]) {
      store.setItem(KEY, raw);
      expect(takeStashedForm(KEY, { now: T0, store })).toBeUndefined();
      expect(store.length).toBe(0);
    }
  });

  it("is a no-op without storage", () => {
    // No window in this environment, so the default store is missing.
    expect(() => stashForm(KEY, { a: 1 })).not.toThrow();
    expect(takeStashedForm(KEY)).toBeUndefined();
  });

  it("survives a storage that throws", () => {
    const store = memoryStore();
    store.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    store.getItem = () => {
      throw new Error("SecurityError");
    };
    expect(() => stashForm(KEY, { a: 1 }, { store })).not.toThrow();
    expect(takeStashedForm(KEY, { store })).toBeUndefined();
  });
});
