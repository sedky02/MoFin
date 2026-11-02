import {
  FALLBACK_CURRENCY,
  currentSetupStep,
  guessCurrency,
  shouldNudgeAssistant,
  suggestAccountName,
} from "@/core/onboarding";

describe("guessCurrency", () => {
  it("reads the time zone first: en-US set on a device in Tunis holds dinars", () => {
    expect(guessCurrency({ timeZone: "Africa/Tunis", languages: ["en-US"] })).toBe("TND");
    expect(guessCurrency({ timeZone: "Europe/Paris", languages: ["en-US"] })).toBe("EUR");
  });

  it("falls back to the first language that names a region", () => {
    expect(guessCurrency({ timeZone: "Etc/UTC", languages: ["en", "fr-TN"] })).toBe("TND");
    expect(guessCurrency({ languages: ["de-AT"] })).toBe("EUR");
    expect(guessCurrency({ languages: ["en-GB"] })).toBe("GBP");
  });

  it("does not guess a region from a bare language", () => {
    expect(guessCurrency({ languages: ["en"] })).toBe(FALLBACK_CURRENCY);
    expect(guessCurrency({ languages: ["fr"] })).toBe(FALLBACK_CURRENCY);
  });

  it("uses USD when nothing helps, and survives an invalid language tag", () => {
    expect(guessCurrency({})).toBe(FALLBACK_CURRENCY);
    expect(guessCurrency({ timeZone: "Mars/Olympus", languages: ["not a tag!!", "en-XX"] })).toBe(FALLBACK_CURRENCY);
  });
});

describe("suggestAccountName", () => {
  it("has a name for every account type", () => {
    for (const type of ["BANK", "CASH", "SAVINGS", "CRYPTO"] as const) {
      expect(suggestAccountName(type).length).toBeGreaterThan(2);
    }
  });
});

describe("currentSetupStep", () => {
  const at = (accounts: number, transactions: number, skippedTransaction = false) =>
    currentSetupStep({ accounts, transactions, skippedTransaction });

  it("starts with the first account, and cannot be skipped", () => {
    expect(at(0, 0)).toBe("account");
    expect(at(0, 0, true)).toBe("account");
  });

  it("asks for the first transaction once there is an account", () => {
    expect(at(1, 0)).toBe("transaction");
    expect(at(3, 0)).toBe("transaction");
  });

  it("is over once something is recorded, or the step was skipped", () => {
    expect(at(1, 1)).toBeNull();
    expect(at(1, 0, true)).toBeNull();
    expect(at(2, 40)).toBeNull();
  });
});

describe("shouldNudgeAssistant", () => {
  const now = new Date("2026-11-01T12:00:00Z");
  const base = { setupStep: null, connectedApps: 0, dismissed: false, createdAt: "2026-10-30T12:00:00Z", now };

  it("suggests it to a recent user whose setup is over", () => {
    expect(shouldNudgeAssistant(base)).toBe(true);
  });

  it("waits for the setup flow to finish, so there is one thing to do at a time", () => {
    expect(shouldNudgeAssistant({ ...base, setupStep: "transaction" })).toBe(false);
    expect(shouldNudgeAssistant({ ...base, setupStep: "account" })).toBe(false);
  });

  it("stays away once closed, once an app is connected, and for a demo", () => {
    expect(shouldNudgeAssistant({ ...base, dismissed: true })).toBe(false);
    expect(shouldNudgeAssistant({ ...base, connectedApps: 1 })).toBe(false);
    expect(shouldNudgeAssistant({ ...base, isDemo: true })).toBe(false);
  });

  it("does not nag someone who signed up weeks ago", () => {
    expect(shouldNudgeAssistant({ ...base, createdAt: "2026-09-01T00:00:00Z" })).toBe(false);
    expect(shouldNudgeAssistant({ ...base, createdAt: "2026-10-20T12:00:00Z" })).toBe(true);
  });

  it("treats an unknown sign-up date as new", () => {
    expect(shouldNudgeAssistant({ ...base, createdAt: undefined })).toBe(true);
  });
});
