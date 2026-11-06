import { AccountMemberRole, Prisma } from '@prisma/client';

/** Everyone who can reach an account: its owner, or a member with a role. */
export type AccountRole = 'OWNER' | AccountMemberRole;

/**
 * What someone may want to do with an account:
 * - `view`: read it and everything on it;
 * - `transact`: add, edit and delete its transactions, run its recurring
 *   series, and aim drafts at it;
 * - `goals`: create, edit and end the goals linked to it;
 * - `manage`: change the account itself, its members and its invitations;
 * - `leave`: stop being a member. The owner can't: an account always has one.
 */
export type AccountAction = 'view' | 'transact' | 'goals' | 'manage' | 'leave';

/** The whole permission model. Everything else asks this table. */
const ALLOWED: Record<AccountAction, readonly AccountRole[]> = {
  view: ['OWNER', AccountMemberRole.EDITOR, AccountMemberRole.VIEWER],
  transact: ['OWNER', AccountMemberRole.EDITOR],
  goals: ['OWNER', AccountMemberRole.EDITOR],
  manage: ['OWNER'],
  leave: [AccountMemberRole.EDITOR, AccountMemberRole.VIEWER],
};

export function can(role: AccountRole, action: AccountAction): boolean {
  return ALLOWED[action].includes(role);
}

/**
 * Prisma filter for the accounts `userId` may perform `action` on, to compose
 * into a query. Goes through relations rather than a list of ids, so it can
 * nest under `items: { some: { account: ... } }` as well.
 */
export function accountScope(
  userId: string,
  action: AccountAction,
): Prisma.AccountWhereInput {
  const memberRoles = ALLOWED[action].filter(
    (role): role is AccountMemberRole => role !== 'OWNER',
  );
  return {
    OR: [
      ...(can('OWNER', action) ? [{ userId }] : []),
      ...(memberRoles.length
        ? [{ members: { some: { userId, role: { in: memberRoles } } } }]
        : []),
    ],
  };
}
