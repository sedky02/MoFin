// Typed query-key factories. NEVER use raw string keys anywhere.

export const accountKeys = {
  all: ["accounts"] as const,
  list: (status: "active" | "archived" | "all" = "active") =>
    [...accountKeys.all, "list", status] as const,
  balance: (id?: string) => [...accountKeys.all, "balance", id] as const,
};

export const categoryKeys = {
  all: ["categories"] as const,
  list: (status: "active" | "archived" | "all" = "active") =>
    [...categoryKeys.all, "list", status] as const,
  /** The categories that fit a shared account: its owner's. */
  forAccount: (accountId: string, status: "active" | "archived" | "all" = "active") =>
    [...categoryKeys.list(status), accountId] as const,
};

export const sharingKeys = {
  all: ["account-sharing"] as const,
  members: (accountId: string) => [...sharingKeys.all, "members", accountId] as const,
  invitations: (accountId: string) => [...sharingKeys.all, "invitations", accountId] as const,
  owned: () => [...sharingKeys.all, "owned"] as const,
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
  monthly: (year: number, month: number, accountId?: string, currency?: string) =>
    [...analyticsKeys.all, "monthly", year, month, accountId, currency] as const,
  series: (currency: string, months: number, accountId?: string) =>
    [...analyticsKeys.all, "series", currency, months, accountId] as const,
  daily: (currency: string, from: string, days: number, timeZone: string, accountId?: string) =>
    [...analyticsKeys.all, "daily", currency, from, days, timeZone, accountId] as const,
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

export const connectedAppKeys = {
  all: ["connected-apps"] as const,
};

export const aiCredentialKeys = {
  all: ["ai-credentials"] as const,
};

export const aiChatKeys = {
  all: ["ai-chats"] as const,
  list: () => [...aiChatKeys.all, "list"] as const,
  detail: (id: string) => [...aiChatKeys.all, "detail", id] as const,
};
