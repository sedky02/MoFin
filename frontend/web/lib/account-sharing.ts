// What a person may do with an account, for hiding what the API would refuse anyway. The API
// decides; this only keeps the screens honest. A missing role means the account came from
// somewhere that doesn't carry one: treat it as the viewer's own.
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

/** May add and change transactions and goals on it. */
export function canPost(account: WithRole | null | undefined): boolean {
  return !!account && account.role !== "VIEWER";
}

/** May change the account itself, its members and its invitations. */
export function canManage(account: WithRole | null | undefined): boolean {
  return !!account && (account.role === undefined || account.role === "OWNER");
}

/** The accounts a form can post to: viewers can't. */
export function writableAccounts<T extends WithRole>(accounts: T[]): T[] {
  return accounts.filter(canPost);
}

/**
 * Accounts a transfer from `account` can go to: one transaction sits on one ledger, so both sides
 * need the same owner.
 */
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

/** A person's name on a member list, without ever showing a bare id. */
export function memberName(member: { displayName?: string | null; email?: string | null }): string {
  return member.displayName?.trim() || member.email || "A member";
}

/** "Added by Sam", with "Edited by Lee" when someone else changed it later. Null: nothing to say. */
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

/** Where an invitation's token waits while someone signs in or verifies their email. */
export const PENDING_INVITE_KEY = "mofin-pending-invite";
