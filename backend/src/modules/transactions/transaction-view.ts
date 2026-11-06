import { Prisma, TransactionType } from '@prisma/client';
import { AccountRole, can } from '../account-access/account-access';
import { TRANSACTION_INCLUDE } from './transaction-include';

type LoadedTransaction = Prisma.TransactionGetPayload<{
  include: typeof TRANSACTION_INCLUDE;
}>;

/** Stands in for an account the viewer can't reach, so a transfer still reads "Joint → Another account". */
export const HIDDEN_ACCOUNT_ID = 'hidden';
export const HIDDEN_ACCOUNT_NAME = 'Another account';

/**
 * This ledger's side alone: real money moved, with its other half on someone else's ledger, so it
 * can't be edited or deleted from here.
 */
export function isOneSidedTransfer(transaction: {
  type: TransactionType;
  items: unknown[];
}): boolean {
  return (
    transaction.type === TransactionType.TRANSFER &&
    transaction.items.length === 1
  );
}

export function accountIdsOf(transaction: {
  items: { accountId: string }[];
  recurringFromAccountId: string | null;
  recurringToAccountId: string | null;
}): string[] {
  return [
    ...new Set(
      [
        ...transaction.items.map((item) => item.accountId),
        transaction.recurringFromAccountId,
        transaction.recurringToAccountId,
      ].filter((id): id is string => id !== null),
    ),
  ];
}

/**
 * A leg on an account the viewer can't reach keeps its amount (it is the same money) but loses
 * which account it was. `canEdit` tells clients what to offer; the server checks again.
 */
export function presentTransaction(
  transaction: LoadedTransaction,
  roles: ReadonlyMap<string, AccountRole>,
) {
  const visible = (id: string | null) =>
    id !== null && roles.has(id) ? id : null;
  const accountIds = accountIdsOf(transaction);
  return {
    ...transaction,
    recurringFromAccountId: visible(transaction.recurringFromAccountId),
    recurringToAccountId: visible(transaction.recurringToAccountId),
    items: transaction.items.map((item) =>
      roles.has(item.accountId)
        ? item
        : {
            ...item,
            accountId: HIDDEN_ACCOUNT_ID,
            memo: null,
            account: {
              id: HIDDEN_ACCOUNT_ID,
              name: HIDDEN_ACCOUNT_NAME,
              currency: item.currency,
              archivedAt: null,
            } as (typeof item)['account'],
          },
    ),
    canEdit:
      !isOneSidedTransfer(transaction) &&
      accountIds.every((id) => {
        const role = roles.get(id);
        return role !== undefined && can(role, 'transact');
      }),
  };
}
