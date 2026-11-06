// For hiding what the API would refuse anyway: the API decides, this only keeps the screens honest.
// A missing role means an account that carries none (the viewer's own).
import type { Account, AccountRole } from "./types";

export const ROLE_LABEL: Record<AccountRole, string> = {
  OWNER: "Owner",
  EDITOR: "Editor",
  VIEWER: "Viewer",
};

/** What the roles mean, for a tooltip: it doesn't need a place on the screen. */
export const ROLE_HINT =
  "Editors add and change transactions and goals. Viewers can only look. Everyone sees the full history.";

type WithRole = Pick<Account, "role">;

export function canPost(account: WithRole | null | undefined): boolean {
  return !!account && account.role !== "VIEWER";
}

export function canManage(account: WithRole | null | undefined): boolean {
  return !!account && (account.role === undefined || account.role === "OWNER");
}

export function writableAccounts<T extends WithRole>(accounts: T[]): T[] {
  return accounts.filter(canPost);
}

export function sameOwnerAccounts<T extends Pick<Account, "userId">>(
  accounts: T[],
  account: Pick<Account, "userId"> | undefined,
): T[] {
  if (!account?.userId) return accounts;
  return accounts.filter((a) => !a.userId || a.userId === account.userId);
}

/**
 * The account whose owner's categories apply, or undefined for the viewer's own. A shared
 * account's transactions all use one set, so a member picks from the owner's.
 */
export function categoryScope(account: Pick<Account, "id" | "role"> | undefined): string | undefined {
  return account?.role && account.role !== "OWNER" ? account.id : undefined;
}

export function memberName(member: { displayName?: string | null; email?: string | null }): string {
  return member.displayName?.trim() || member.email || "A member";
}

export function authorLine(
  tx: {
    createdBy?: { id: string; displayName?: string | null } | null;
    updatedBy?: { id: string; displayName?: string | null } | null;
  },
  viewerId: string | undefined,
): string | null {
  const name = (person: { id: string; displayName?: string | null }) =>
    person.id === viewerId ? "you" : memberName(person);
  const parts: string[] = [];
  if (tx.createdBy) parts.push(`Added by ${name(tx.createdBy)}`);
  if (tx.updatedBy) parts.push(`${parts.length ? "edited" : "Edited"} by ${name(tx.updatedBy)}`);
  return parts.length ? parts.join(", ") : null;
}

export const PENDING_INVITE_KEY = "mofin-pending-invite";
