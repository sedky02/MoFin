import { Bot, Settings, Sparkles, Tags, Wallet, type LucideIcon } from 'lucide-react-native';

export type MoreItem = {
  href: '/accounts' | '/categories' | '/drafts' | '/connect' | '/settings';
  label: string;
  description: string;
  icon: LucideIcon;
  /** Show the PENDING draft count. */
  badge?: 'drafts';
};

/** The "More" tab's list: what the web keeps in its sidebar but the tab bar has no room for. Labels match the web. */
export const MORE_ITEMS: MoreItem[] = [
  { href: '/accounts', label: 'Accounts', description: 'Balances and account types', icon: Wallet },
  { href: '/categories', label: 'Categories', description: 'Income and expense categories', icon: Tags },
  { href: '/drafts', label: 'Drafts', description: 'Review what the assistant parsed', icon: Sparkles, badge: 'drafts' },
  { href: '/connect', label: 'AI connector', description: 'Connect an AI assistant', icon: Bot },
  { href: '/settings', label: 'Settings', description: 'Profile, theme and data', icon: Settings },
];
