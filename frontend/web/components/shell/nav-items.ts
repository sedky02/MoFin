import {
  LayoutDashboard,
  Wallet,
  PlusCircle,
  Sparkles,
  ReceiptText,
  Tags,
  Target,
  Bot,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Show the PENDING draft count badge. */
  badge?: "drafts";
  /** Shorter label for the mobile bottom bar, when the sidebar label doesn't describe the slot. */
  barLabel?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/accounts", label: "Accounts", icon: Wallet },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/transactions/new", label: "New Transaction", icon: PlusCircle },
  { href: "/drafts", label: "Drafts", icon: Sparkles, badge: "drafts" },
  { href: "/transactions", label: "Transactions", icon: ReceiptText },
  { href: "/categories", label: "Categories", icon: Tags },
  { href: "/connect", label: "AI Connector", icon: Bot },
  { href: "/settings", label: "Settings", icon: Settings },
];

/**
 * Mobile bottom bar routes, in order; the "More" button follows them and opens
 * the nav sheet.
 */
const BOTTOM_NAV_HREFS = ["/dashboard", "/transactions", "/transactions/new", "/goals"];

export const BOTTOM_NAV_ITEMS: NavItem[] = BOTTOM_NAV_HREFS.flatMap((href) =>
  NAV_ITEMS.filter((i) => i.href === href),
);

const isUnder = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/**
 * Whether a nav item is the current section, for the sidebar and the bottom bar.
 * The dashboard matches exactly, other items match their section. The add form
 * sits under /transactions but is its own item, so it doesn't also light up the list.
 */
export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/transactions") return isUnder(pathname, href) && !isUnder(pathname, "/transactions/new");
  return isUnder(pathname, href);
}
