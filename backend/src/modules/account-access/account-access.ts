import { AccountMemberRole, Prisma } from '@prisma/client';

export type AccountRole = 'OWNER' | AccountMemberRole;

/**
 * view: read. transact: change transactions, series and drafts. goals: linked goals. manage: the
 * account, members, invitations. leave: members only.
 */
export type AccountAction = 'view' | 'transact' | 'goals' | 'manage' | 'leave';

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
 * Prisma filter for accounts `userId` may do `action` on; built from relations so it nests under
 * `items: { some: { account } }`.
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
