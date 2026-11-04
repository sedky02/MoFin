import type { LucideIcon } from 'lucide-react-native';
import { Bot, Settings, Sparkles, Tags, Wallet } from '@/lib/icons';

export type MoreHref = '/accounts' | '/categories' | '/drafts' | '/connect' | '/settings';

/** Icon tile colour: one per group, so a row's group reads at a glance. */
export type MoreTone = 'money' | 'ai' | 'app';

export type MoreItem = {
  href: MoreHref;
  label: string;
  icon: LucideIcon;
  tone: MoreTone;
};

export type MoreGroup = { title: string; items: MoreItem[] };

/** What the More tab gathers, grouped by what it is for. The AI group gets its own highlighted card. */
export const MORE_GROUPS: MoreGroup[] = [
  {
    title: 'Your money',
    items: [
      { href: '/accounts', label: 'Accounts', icon: Wallet, tone: 'money' },
      { href: '/categories', label: 'Categories', icon: Tags, tone: 'money' },
    ],
  },
  {
    title: 'AI assistant',
    items: [
      { href: '/drafts', label: 'Ask MoFin', icon: Sparkles, tone: 'ai' },
      { href: '/connect', label: 'Connect Claude or ChatGPT', icon: Bot, tone: 'ai' },
    ],
  },
  {
    title: 'App',
    items: [{ href: '/settings', label: 'Settings', icon: Settings, tone: 'app' }],
  },
];

/** Every item, flat (labels and routes in one place for tests and other menus). */
export const MORE_ITEMS: MoreItem[] = MORE_GROUPS.flatMap((g) => g.items);

export type MoreCounts = {
  accounts?: number;
  categories?: number;
  pendingDrafts?: number;
  connectedApps?: number;
};

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * The second line of a More row: live status where it helps ("3 accounts", "2 drafts to review",
 * "Not connected yet"), otherwise what the screen is for. Falls back to the description while
 * counts load.
 */
export function moreSubtitle(href: MoreHref, counts: MoreCounts): string {
  switch (href) {
    case '/accounts':
      return counts.accounts === undefined ? 'Cash, bank, savings and crypto' : counts.accounts === 0 ? 'Add your first account' : `${plural(counts.accounts, 'account', 'accounts')} · balances and types`;
    case '/categories':
      return counts.categories === undefined ? 'Group your income and spending' : `${plural(counts.categories, 'category', 'categories')} · icons and colours`;
    case '/drafts':
      return counts.pendingDrafts
        ? `${plural(counts.pendingDrafts, 'draft', 'drafts')} to review`
        : 'Type “Spent 12 on lunch”: MoFin drafts it, you approve';
    case '/connect':
      return counts.connectedApps
        ? `${plural(counts.connectedApps, 'app', 'apps')} connected · manage in Settings`
        : 'Let your assistant read balances and suggest transactions';
    case '/settings':
      return 'Profile, appearance, security and data';
  }
}
