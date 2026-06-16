import { BadRequestException, Injectable } from '@nestjs/common';
import { LedgerDirection, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AccountsService } from '../accounts/accounts.service';
import { GetBalanceQueryDto, LedgerEntryInput } from './dto/ledger.dto';

type Db = Prisma.TransactionClient;

/**
 * Sign convention (MoFin-specific — note it is NOT textbook double-entry):
 *   CREDIT  => money INTO an account  => contributes +amount to its balance
 *   DEBIT   => money OUT of an account => contributes -amount to its balance
 *
 * INCOME and EXPENSE are single-sided (no contra/equity account); only TRANSFER
 * produces a balanced debit+credit pair. Balances are always derived from these
 * entries, never stored.
 */
@Injectable()
export class LedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
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
    },
  ): Promise<LedgerEntryInput[]> {
    // assertOwned returns the account, so we validate ownership and currency in one pass.
    const fromAccount = command.fromAccountId
      ? await this.accountsService.assertOwned(userId, command.fromAccountId)
      : null;
    const toAccount = command.toAccountId
      ? await this.accountsService.assertOwned(userId, command.toAccountId)
      : null;

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

    if (command.type === 'INCOME') {
      return [
        {
          accountId: command.toAccountId!,
          direction: 'CREDIT',
          amount: command.amount,
          currency: command.currency,
          memo: command.description,
        },
      ];
    }

    if (command.type === 'EXPENSE') {
      return [
        {
          accountId: command.fromAccountId!,
          direction: 'DEBIT',
          amount: command.amount,
          currency: command.currency,
          memo: command.description,
        },
      ];
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

  async createEntries(db: Db, userId: string, transactionId: string, entries: LedgerEntryInput[]): Promise<void> {
    await db.transactionItem.createMany({
      data: entries.map((entry) => ({
        userId,
        transactionId,
        accountId: entry.accountId,
        direction: entry.direction,
        amount: new Prisma.Decimal(entry.amount),
        currency: entry.currency,
        memo: entry.memo,
      })),
    });
  }

  async getBalance(userId: string, query: GetBalanceQueryDto) {
    if (query.accountId) await this.accountsService.assertOwned(userId, query.accountId);

    const where = {
      userId,
      ...(query.accountId ? { accountId: query.accountId } : {}),
      ...(query.currency ? { currency: query.currency } : {}),
    };

    const items = await this.prisma.transactionItem.findMany({ where });
    const balances = new Map<string, Prisma.Decimal>();

    for (const item of items) {
      const key = query.accountId ? item.currency : `${item.accountId}:${item.currency}`;
      const current = balances.get(key) ?? new Prisma.Decimal(0);
      const signed = item.direction === LedgerDirection.CREDIT ? item.amount : item.amount.negated();
      balances.set(key, current.plus(signed));
    }

    return Array.from(balances.entries()).map(([key, balance]) => ({ key, balance: balance.toString() }));
  }
}
