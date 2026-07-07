// Typed query-key factories. NEVER use raw string keys anywhere.

export const accountKeys = {
  all: ["accounts"] as const,
  balance: (id?: string) => [...accountKeys.all, "balance", id] as const,
};

export const categoryKeys = {
  all: ["categories"] as const,
};

export const transactionKeys = {
  all: ["transactions"] as const,
  detail: (id: string) => [...transactionKeys.all, "detail", id] as const,
};

export const draftKeys = {
  all: ["drafts"] as const,
  list: (status: string) => [...draftKeys.all, "list", status] as const,
};

export const ledgerKeys = {
  all: ["ledger"] as const,
  balance: (accountId?: string, currency?: string) =>
    [...ledgerKeys.all, "balance", accountId, currency] as const,
};

export const analyticsKeys = {
  all: ["analytics"] as const,
  monthly: (year: number, month: number, accountId?: string) =>
    [...analyticsKeys.all, "monthly", year, month, accountId] as const,
};

export const searchKeys = {
  all: ["search"] as const,
  list: (params: Record<string, unknown>) =>
    [...searchKeys.all, "list", params] as const,
};

export const userKeys = {
  me: ["user", "me"] as const,
};

export const goalKeys = {
  all: ["goals"] as const,
  list: (status: "active" | "archived" | "all" = "active") =>
    [...goalKeys.all, "list", status] as const,
  detail: (id: string) => [...goalKeys.all, "detail", id] as const,
  history: (id: string) => [...goalKeys.all, "history", id] as const,
};
