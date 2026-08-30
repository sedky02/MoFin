import { createElement } from "react";
import {
  ShoppingCart,
  UtensilsCrossed,
  Zap,
  Clapperboard,
  Car,
  Plane,
  HeartPulse,
  TrendingUp,
  Laptop,
  Home,
  Receipt,
  type LucideIcon,
} from "lucide-react";

const RULES: [RegExp, LucideIcon][] = [
  [/shop|retail|store/i, ShoppingCart],
  [/food|dining|restaurant|grocer/i, UtensilsCrossed],
  [/util|bill|electric|water|gas\b/i, Zap],
  [/entertain|movie|game|stream/i, Clapperboard],
  [/transport|fuel|car|uber|taxi/i, Car],
  [/travel|flight|trip|hotel/i, Plane],
  [/health|medical|pharmacy|doctor/i, HeartPulse],
  [/invest|dividend|stock|brokerage/i, TrendingUp],
  [/electronic|tech|computer|laptop/i, Laptop],
  [/rent|mortgage|home|deposit|house/i, Home],
];

function iconFor(name?: string | null): LucideIcon {
  if (name) {
    for (const [pattern, Icon] of RULES) {
      if (pattern.test(name)) return Icon;
    }
  }
  return Receipt;
}

/** Best-effort icon for a free-form category/goal/merchant name; falls back to a generic receipt. */
export function CategoryIcon({
  name,
  className,
}: {
  name?: string | null;
  className?: string;
}) {
  return createElement(iconFor(name), { className });
}
