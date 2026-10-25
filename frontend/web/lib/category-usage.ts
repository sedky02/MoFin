import type { CategoryUsage } from "@/lib/types";

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** A used category can't be deleted (the backend refuses); it can be archived. */
export function isCategoryInUse(usage: CategoryUsage) {
  return usage.transactions > 0 || usage.budgets > 0;
}

/** "Used by 3 transactions", "Used by 1 transaction and 1 budget", or null when unused. */
export function describeCategoryUsage(usage: CategoryUsage): string | null {
  const parts: string[] = [];
  if (usage.transactions > 0) parts.push(plural(usage.transactions, "transaction"));
  if (usage.budgets > 0) parts.push(plural(usage.budgets, "budget"));
  return parts.length ? `Used by ${parts.join(" and ")}` : null;
}
