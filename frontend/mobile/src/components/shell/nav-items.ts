import type { LucideIcon } from 'lucide-react-native';
import { Bot, MessageCircle, Settings, Tags, Target, Wallet } from '@/lib/icons';

export type MoreHref = '/accounts' | '/categories' | '/goals' | '/ask' | '/connect' | '/settings';

/** Icon tile colour: one per group, so a row's group reads at a glance. */
export type MoreTone = 'money' | 'ai' | 'app';

export type MoreItem = {
  href: MoreHref;
  label: string;
  icon: LucideIcon;
  tone: MoreTone;
};

export type MoreGroup = { title: string; items: MoreItem[] };

/**
 * What the More tab gathers, grouped by what it is for. AI drafts has its own tab; the AI group
 * holds the saved Ask chats and connecting an assistant, in the highlighted card.
 */
export const MORE_GROUPS: MoreGroup[] = [
  {
    title: 'Your money',
    items: [
      { href: '/accounts', label: 'Accounts', icon: Wallet, tone: 'money' },
      { href: '/categories', label: 'Categories', icon: Tags, tone: 'money' },
      { href: '/goals', label: 'Goals', icon: Target, tone: 'money' },
    ],
  },
  {
    title: 'AI assistant',
    items: [
      { href: '/ask', label: 'Ask MoFin', icon: MessageCircle, tone: 'ai' },
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
  activeGoals?: number;
  connectedApps?: number;
};

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * The second line of a More row: live status where it helps ("3 accounts", "2 active goals",
 * "1 app connected"), otherwise what the screen is for. Falls back to the description while
 * counts load.
 */
export function moreSubtitle(href: MoreHref, counts: MoreCounts): string {
  switch (href) {
    case '/accounts':
      return counts.accounts === undefined ? 'Cash, bank, savings, crypto' : counts.accounts === 0 ? 'Add your first account' : plural(counts.accounts, 'account', 'accounts');
    case '/categories':
      return counts.categories === undefined ? 'Group income and spending' : plural(counts.categories, 'category', 'categories');
    case '/goals':
      return counts.activeGoals ? plural(counts.activeGoals, 'active goal', 'active goals') : 'Save, earn or spend less';
    case '/ask':
      return 'Questions answered with charts';
    case '/connect':
      return counts.connectedApps
        ? `${plural(counts.connectedApps, 'app', 'apps')} connected`
        : 'Use MoFin from your assistant';
    case '/settings':
      return 'Profile, theme, security, data';
  }
}
