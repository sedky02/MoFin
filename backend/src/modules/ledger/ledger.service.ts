import { BadRequestException, Injectable } from '@nestjs/common';
import { LedgerDirection, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AccountAccessService } from '../account-access/account-access.service';
import { GetBalanceQueryDto, LedgerEntryInput } from './dto/ledger.dto';

type Db = Prisma.TransactionClient;

export const DIFFERENT_OWNERS_MESSAGE =
  "A transfer can't cross accounts with different owners. Record an expense on one and income on the other.";

/** What a command posts, and whose ledger it goes on: the account owner's, not always the caller's. */
export interface LedgerPlan {
  ledgerUserId: string;
  entries: LedgerEntryInput[];
}

/**
 * MoFin's own sign convention: CREDIT adds to an account's balance, DEBIT subtracts. Only TRANSFER
 * posts a debit+credit pair; balances are derived, never stored.
 */
@Injectable()
export class LedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccountAccessService,
  ) {}

  async buildEntriesForCommand(
    userId: string,
    command: {
      type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
      amount: string;
      currency: string;
      fromAccountId?: string;
      toAccountId?: string;
      description: string;
      items?: { amount: string; categoryId?: string; memo?: string }[];
    },
    db: Db = this.prisma,
  ): Promise<LedgerPlan> {
    // Archived accounts are read-only: nothing new can be posted to them.
    const target = async (accountId?: string) =>
      accountId
        ? (
            await this.access.assertAccess(userId, accountId, 'transact', {
              db,
              activeOnly: true,
            })
          ).account
        : null;
    const fromAccount = await target(command.fromAccountId);
    const toAccount = await target(command.toAccountId);

    // One transaction sits on one ledger, so both sides need the same owner.
    if (
      command.type === 'TRANSFER' &&
      fromAccount &&
      toAccount &&
      fromAccount.userId !== toAccount.userId
    ) {
      throw new BadRequestException(DIFFERENT_OWNERS_MESSAGE);
    }

    // Currency consistency (audit A3): every leg must be in the account's own
    // currency, and a transfer cannot silently cross currencies.
    if (fromAccount && fromAccount.currency !== command.currency) {
      throw new BadRequestException(
        `Source account currency (${fromAccount.currency}) does not match transaction currency (${command.currency})`,
      );
    }
    if (toAccount && toAccount.currency !== command.currency) {
      throw new BadRequestException(
        `Destination account currency (${toAccount.currency}) does not match transaction currency (${command.currency})`,
      );
    }

    const ledgerOwner = command.type === 'INCOME' ? toAccount : fromAccount;
    return {
      ledgerUserId: ledgerOwner!.userId,
      entries: this.entriesFor(command),
    };
  }

  private entriesFor(command: {
    type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
    amount: string;
    currency: string;
    fromAccountId?: string;
    toAccountId?: string;
    description: string;
    items?: { amount: string; categoryId?: string; memo?: string }[];
  }): LedgerEntryInput[] {
    if (command.type === 'INCOME') {
      return (
        command.items?.length ? command.items : [{ amount: command.amount }]
      ).map((item) => ({
        accountId: command.toAccountId!,
        direction: 'CREDIT',
        amount: item.amount,
        currency: command.currency,
        categoryId: item.categoryId,
        memo: item.memo ?? command.description,
      }));
    }

    if (command.type === 'EXPENSE') {
      return (
        command.items?.length ? command.items : [{ amount: command.amount }]
      ).map((item) => ({
        accountId: command.fromAccountId!,
        direction: 'DEBIT',
        amount: item.amount,
        currency: command.currency,
        categoryId: item.categoryId,
        memo: item.memo ?? command.description,
      }));
    }

    return [
      {
        accountId: command.fromAccountId!,
        direction: 'DEBIT',
        amount: command.amount,
        currency: command.currency,
        memo: `Transfer out: ${command.description}`,
      },
      {
        accountId: command.toAccountId!,
        direction: 'CREDIT',
        amount: command.amount,
        currency: command.currency,
        memo: `Transfer in: ${command.description}`,
      },
    ];
  }

  async createEntries(
    db: Db,
    userId: string,
    transactionId: string,
    entries: LedgerEntryInput[],
  ): Promise<void> {
    await db.transactionItem.createMany({
      data: entries.map((entry) => ({
        userId,
        transactionId,
        accountId: entry.accountId,
        categoryId: entry.categoryId,
        direction: entry.direction,
        amount: new Prisma.Decimal(entry.amount),
        currency: entry.currency,
        memo: entry.memo,
      })),
    });
  }

  async getBalance(userId: string, query: GetBalanceQueryDto) {
    if (query.accountId)
      await this.access.assertAccess(userId, query.accountId, 'view');
    const accountIds = query.accountId
      ? [query.accountId]
      : await this.access.accountIdsForTotals(userId);

    const where = {
      accountId: { in: accountIds },
      // A deleted transaction's lines stay in the table (for restore) but are no longer money.
      transaction: { deletedAt: null },
      ...(query.currency ? { currency: query.currency } : {}),
    };

    // Net CREDIT/DEBIT per (account, currency) in the database, not the whole ledger summed in
    // Node.
    const rows = await this.prisma.transactionItem.groupBy({
      by: ['accountId', 'currency', 'direction'],
      where,
      _sum: { amount: true },
    });

    // Each account starts from its opening balance (in the account's own
    // currency), so an account with one and no entries yet still shows it.
    const openings = await this.prisma.account.findMany({
      where: {
        id: { in: accountIds },
        openingBalance: { not: 0 },
        ...(query.currency ? { currency: query.currency } : {}),
      },
      select: { id: true, currency: true, openingBalance: true },
    });

    const balances = new Map<string, Prisma.Decimal>();
    for (const opening of openings) {
      const key = query.accountId
        ? opening.currency
        : `${opening.id}:${opening.currency}`;
      balances.set(
        key,
        (balances.get(key) ?? new Prisma.Decimal(0)).plus(
          opening.openingBalance,
        ),
      );
    }
    for (const row of rows) {
      const key = query.accountId
        ? row.currency
        : `${row.accountId}:${row.currency}`;
      const current = balances.get(key) ?? new Prisma.Decimal(0);
      const sum = row._sum.amount ?? new Prisma.Decimal(0);
      const signed =
        row.direction === LedgerDirection.CREDIT ? sum : sum.negated();
      balances.set(key, current.plus(signed));
    }

    return Array.from(balances.entries()).map(([key, balance]) => ({
      key,
      balance: balance.toString(),
    }));
  }
}
