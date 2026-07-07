import {
  LayoutDashboard,
  Wallet,
  PlusCircle,
  Sparkles,
  Search,
  Tags,
  Target,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Show the PENDING draft count badge. */
  badge?: "drafts";
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/accounts", label: "Accounts", icon: Wallet },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/transactions/new", label: "New Transaction", icon: PlusCircle },
  { href: "/drafts", label: "Drafts", icon: Sparkles, badge: "drafts" },
  { href: "/search", label: "Search", icon: Search },
  { href: "/categories", label: "Categories", icon: Tags },
  { href: "/settings", label: "Settings", icon: Settings },
];
