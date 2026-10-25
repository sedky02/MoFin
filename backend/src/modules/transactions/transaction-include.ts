import { Prisma } from '@prisma/client';

/**
 * Relations every transaction response carries. Each ledger leg includes its
 * account so clients can show "Main checking → Emergency fund" without a second
 * lookup; archived accounts are still returned because the relation is a plain
 * foreign key, not filtered by `archivedAt`.
 */
export const TRANSACTION_INCLUDE = {
  items: { include: { category: true, account: true } },
  category: true,
} satisfies Prisma.TransactionInclude;
