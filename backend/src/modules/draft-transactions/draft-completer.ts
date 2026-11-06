import { BadRequestException, Injectable } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

/** How far back "the account used most" looks. */
export const ACCOUNT_USAGE_DAYS = 30;
/** How many of the user's latest categorised transactions a category is learned from. */
export const CATEGORY_HISTORY_LIMIT = 500;

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

export interface CompleterCategory {
  id: string;
  name: string;
  type: string;
}

/** The ids a draft carries, as an assistant proposed them. */
export interface DraftIds {
  type: TransactionType;
  description: string;
  fromAccountId?: string;
  toAccountId?: string;
  categoryId?: string;
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
 * Rejects a category id the user doesn't have, or one of the wrong type, and
 * lists the ones that fit this draft's type. Transfers have no category: one
 * sent with a transfer is dropped, not rejected.
 */
export function assertKnownCategory(
  draft: DraftIds,
  categories: CompleterCategory[],
): void {
  const id = draft.categoryId;
  if (!id || draft.type === TransactionType.TRANSFER) return;
  const fitting = categories
    .filter((c) => c.type === draft.type)
    .map((c) => `${c.name} (${c.id})`)
    .join('; ');
  const options = `Use one of the ${draft.type} categories: ${fitting || 'none'}, or leave categoryId out when unsure. Categories are never created from a draft.`;
  const found = categories.find((c) => c.id === id);
  if (!found)
    throw new BadRequestException(`Unknown categoryId "${id}". ${options}`);
  if (found.type !== draft.type)
    throw new BadRequestException(
      `"${found.name}" is an ${found.type} category, but this draft is ${draft.type}. ${options}`,
    );
}

// Words that say nothing about what was bought or from whom.
const STOPWORDS = new Set(
  (
    'the and for from with at to of in on my our some this that last next today yesterday tonight morning ' +
    'paid pay payed bought buy spent spend got get received receive sent send put moved move ' +
    'cash card tnd usd eur dinar dinars dollar dollars euro euros dt ' +
    'des les pour avec chez une dans sur aux du de la le un et'
  ).split(' '),
);

/** The meaningful words of a description: lower case, no accents, digits or short words. */
export function descriptionWords(text: string): string[] {
  const words = text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  return [...new Set(words)];
}

/** "taxi" and "taxis", "grocery" and "groceries": the same word for matching. */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 4 && long.startsWith(short.slice(0, -1));
}

/**
 * The category the user has used most for descriptions like this one, or
 * undefined when the history doesn't say so clearly:
 * - past transactions with the same words decide first: one is enough, if at
 *   least two thirds of them agree;
 * - otherwise past transactions sharing a word (a merchant, an item) vote,
 *   weighted by how many words they share: at least two must back the winner,
 *   and it needs two thirds of the weight.
 * Only `allowed` categories (active, of the draft's type) count.
 */
export function categoryFromHistory(
  description: string,
  history: Array<{ description: string; categoryId: string | null }>,
  allowed: ReadonlySet<string>,
): string | undefined {
  const wanted = descriptionWords(description);
  if (!wanted.length) return undefined;
  const key = [...wanted].sort().join(' ');

  const exact = new Map<string, number>();
  const loose = new Map<string, { rows: number; weight: number }>();
  for (const row of history) {
    if (!row.categoryId || !allowed.has(row.categoryId)) continue;
    const words = descriptionWords(row.description);
    if ([...words].sort().join(' ') === key) {
      exact.set(row.categoryId, (exact.get(row.categoryId) ?? 0) + 1);
    }
    const shared = wanted.filter((w) => words.some((v) => sameWord(w, v)));
    if (shared.length) {
      const vote = loose.get(row.categoryId) ?? { rows: 0, weight: 0 };
      vote.rows += 1;
      vote.weight += shared.length;
      loose.set(row.categoryId, vote);
    }
  }

  const leader = <V>(votes: Map<string, V>, size: (v: V) => number) => {
    let total = 0;
    let best: [string, V] | undefined;
    for (const entry of votes) {
      total += size(entry[1]);
      if (!best || size(entry[1]) > size(best[1])) best = entry;
    }
    return best && size(best[1]) * 3 >= total * 2 ? best : undefined;
  };
  const byExact = leader(exact, (n) => n);
  if (byExact) return byExact[0];
  if (exact.size) return undefined; // the same words, filed differently: unclear
  const byWords = leader(loose, (v) => v.weight);
  return byWords && byWords[1].rows >= 2 ? byWords[0] : undefined;
}

/**
 * Fills in what an assistant's draft leaves out, the same way for the in-app
 * chat and for MCP. The assistant never decides the defaults itself.
 * - Account: a named one is kept (it must be one of the user's active
 *   accounts); a missing one is picked here.
 * - Category: it must be an existing, active category of the draft's type.
 *   The one the user has used most for similar descriptions wins; otherwise
 *   the assistant's pick stays; with neither, the draft has no category.
 *   Categories are never created.
 */
@Injectable()
export class DraftCompleter {
  constructor(private readonly prisma: PrismaService) {}

  async complete<T extends DraftIds>(
    userId: string,
    draft: T,
    now: Date = new Date(),
  ): Promise<T & DraftIds> {
    const [accounts, categories] = await Promise.all([
      this.prisma.account.findMany({
        where: { userId, archivedAt: null },
        select: { id: true, name: true },
      }),
      this.prisma.category.findMany({
        where: { OR: [{ userId }, { userId: null }], archivedAt: null },
        select: { id: true, name: true, type: true },
      }),
    ]);
    assertKnownAccounts(draft, accounts);
    assertKnownCategory(draft, categories);

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

    let categoryId: string | undefined;
    if (draft.type !== TransactionType.TRANSFER) {
      const allowed = new Set(
        categories.filter((c) => c.type === draft.type).map((c) => c.id),
      );
      const history = await this.prisma.transaction.findMany({
        where: {
          userId,
          deletedAt: null,
          type: draft.type,
          categoryId: { in: [...allowed] },
        },
        orderBy: { occurredAt: 'desc' },
        take: CATEGORY_HISTORY_LIMIT,
        select: { description: true, categoryId: true },
      });
      categoryId =
        categoryFromHistory(draft.description, history, allowed) ??
        draft.categoryId;
    }
    return { ...draft, fromAccountId, toAccountId, categoryId };
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
