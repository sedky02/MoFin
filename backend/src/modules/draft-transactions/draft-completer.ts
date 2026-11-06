import { BadRequestException, Injectable } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

/** How far back "the account used most" looks. */
export const ACCOUNT_USAGE_DAYS = 30;

export interface CompleterAccount {
  id: string;
  name: string;
}

/** How often one account was used lately, and when last. */
export interface AccountUsage {
  accountId: string;
  count: number;
  lastAt: Date;
}

/** The ids a draft carries, as an assistant proposed them. */
export interface DraftIds {
  type: TransactionType;
  fromAccountId?: string;
  toAccountId?: string;
}

/**
 * The account a draft uses when the user didn't name one, in this order:
 * 1. the account they saved as their main one (settings.mainAccountId);
 * 2. the one with the most transactions in the last 30 days, the most
 *    recently used winning a tie;
 * 3. the first by name.
 * Only active accounts count: an archived saved account is skipped.
 */
export function pickDefaultAccount(
  accounts: CompleterAccount[],
  savedId: string | undefined,
  usage: AccountUsage[],
): string | undefined {
  const active = new Set(accounts.map((a) => a.id));
  if (savedId && active.has(savedId)) return savedId;

  const used = usage
    .filter((u) => active.has(u.accountId) && u.count > 0)
    .sort(
      (a, b) => b.count - a.count || b.lastAt.getTime() - a.lastAt.getTime(),
    );
  if (used.length) return used[0].accountId;

  return [...accounts].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )[0]?.id;
}

/**
 * Transactions per account, from each transaction's ledger rows. A transfer
 * counts once for each side; an account appearing twice in one transaction
 * counts once.
 */
export function accountUsage(
  transactions: Array<{
    occurredAt: Date;
    items: Array<{ accountId: string }>;
  }>,
): AccountUsage[] {
  const byAccount = new Map<string, AccountUsage>();
  for (const tx of transactions) {
    for (const accountId of new Set(tx.items.map((i) => i.accountId))) {
      const seen = byAccount.get(accountId);
      if (!seen)
        byAccount.set(accountId, {
          accountId,
          count: 1,
          lastAt: tx.occurredAt,
        });
      else {
        seen.count += 1;
        if (tx.occurredAt > seen.lastAt) seen.lastAt = tx.occurredAt;
      }
    }
  }
  return [...byAccount.values()];
}

/** Rejects account ids the user doesn't have (or has archived), naming the ones they can use. */
export function assertKnownAccounts(
  draft: DraftIds,
  accounts: CompleterAccount[],
): void {
  for (const id of [draft.fromAccountId, draft.toAccountId]) {
    if (id && !accounts.some((a) => a.id === id)) {
      const options = accounts.map((a) => `${a.name} (${a.id})`).join('; ');
      throw new BadRequestException(
        `Unknown account id "${id}". Use one of: ${options || 'none (the user has no active accounts)'}, or leave the account out to use the user's default.`,
      );
    }
  }
}

/**
 * Fills in what an assistant's draft leaves out, the same way for the in-app
 * chat and for MCP: a named account is kept (it must be one of the user's
 * active accounts), a missing one is picked here. The assistant never decides
 * the default itself.
 */
@Injectable()
export class DraftCompleter {
  constructor(private readonly prisma: PrismaService) {}

  async complete<T extends DraftIds>(
    userId: string,
    draft: T,
    now: Date = new Date(),
  ): Promise<T & DraftIds> {
    const accounts = await this.prisma.account.findMany({
      where: { userId, archivedAt: null },
      select: { id: true, name: true },
    });
    assertKnownAccounts(draft, accounts);

    let { fromAccountId, toAccountId } = draft;
    if (draft.type === TransactionType.EXPENSE) toAccountId = undefined;
    if (draft.type === TransactionType.INCOME) fromAccountId = undefined;
    const needsFrom = draft.type !== TransactionType.INCOME && !fromAccountId;
    const needsTo = draft.type === TransactionType.INCOME && !toAccountId;
    if (needsFrom || needsTo) {
      const fallback = await this.defaultAccountId(userId, accounts, now);
      // A transfer's missing side is the source: the user said where the money went.
      if (needsFrom && fallback !== toAccountId) fromAccountId = fallback;
      if (needsTo) toAccountId = fallback;
    }
    return { ...draft, fromAccountId, toAccountId };
  }

  async defaultAccountId(
    userId: string,
    accounts: CompleterAccount[],
    now: Date = new Date(),
  ): Promise<string | undefined> {
    if (!accounts.length) return undefined;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { settings: true },
    });
    const saved = (user?.settings as { mainAccountId?: unknown } | null)
      ?.mainAccountId;
    const savedId = typeof saved === 'string' ? saved : undefined;
    if (savedId && accounts.some((a) => a.id === savedId)) return savedId;

    const since = new Date(now.getTime() - ACCOUNT_USAGE_DAYS * 86_400_000);
    const recent = await this.prisma.transaction.findMany({
      where: { userId, deletedAt: null, occurredAt: { gte: since, lte: now } },
      select: { occurredAt: true, items: { select: { accountId: true } } },
    });
    return pickDefaultAccount(accounts, savedId, accountUsage(recent));
  }
}
