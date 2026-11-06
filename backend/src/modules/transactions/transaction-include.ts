import { Prisma } from '@prisma/client';

/**
 * Each leg includes its account so clients can name it without a second lookup (archived ones too).
 * An account's `metadata` is its owner's own settings, so it stays out, and so does anyone's email.
 */
export const TRANSACTION_INCLUDE = {
  items: {
    include: { category: true, account: { omit: { metadata: true } } },
  },
  category: true,
  createdBy: { select: { id: true, displayName: true } },
  updatedBy: { select: { id: true, displayName: true } },
} satisfies Prisma.TransactionInclude;
