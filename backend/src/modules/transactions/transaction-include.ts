import { Prisma } from '@prisma/client';

/**
 * Relations every transaction response carries. Each ledger leg includes its
 * account so clients can show "Main checking → Emergency fund" without a second
 * lookup; archived accounts are still returned because the relation is a plain
 * foreign key, not filtered by `archivedAt`. An account's `metadata` is its
 * owner's own settings, so it stays out, and so does anyone's email.
 */
export const TRANSACTION_INCLUDE = {
  items: {
    include: { category: true, account: { omit: { metadata: true } } },
  },
  category: true,
  createdBy: { select: { id: true, displayName: true } },
  updatedBy: { select: { id: true, displayName: true } },
} satisfies Prisma.TransactionInclude;
