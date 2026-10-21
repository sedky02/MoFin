import {
  LayoutDashboard,
  Wallet,
  PlusCircle,
  Sparkles,
  Search,
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
  { href: "/search", label: "Search", icon: Search, barLabel: "Transactions" },
  { href: "/categories", label: "Categories", icon: Tags },
  { href: "/connect", label: "AI Connector", icon: Bot },
  { href: "/settings", label: "Settings", icon: Settings },
];

/**
 * Mobile bottom bar routes, in order; the "More" button follows them and opens
 * the nav sheet. The Transactions slot is the Search item (the transaction list
 * lives there for now), so its href is read from NAV_ITEMS and moves with it.
 */
const BOTTOM_NAV_HREFS = ["/dashboard", "/search", "/transactions/new", "/goals"];

export const BOTTOM_NAV_ITEMS: NavItem[] = BOTTOM_NAV_HREFS.flatMap((href) =>
  NAV_ITEMS.filter((i) => i.href === href),
);

/** Sidebar-style section matching, plus transaction detail pages for the list slot. */
export function isBottomNavActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (pathname.startsWith(href)) return true;
  const listHref = NAV_ITEMS.find((i) => i.barLabel === "Transactions")?.href;
  return (
    href === listHref &&
    pathname.startsWith("/transactions/") &&
    !pathname.startsWith("/transactions/new")
  );
}
