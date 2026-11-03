import {
  Banknote, Briefcase, Car, Clapperboard, Coffee, HeartPulse, Home, Laptop, Plane, Receipt, Repeat,
  ShoppingCart, TrendingUp, UtensilsCrossed, Zap, type LucideIcon,
} from 'lucide-react-native';

import { Icon } from '@/components/ui/icon';

const RULES: [RegExp, LucideIcon][] = [
  [/shop|retail|store/i, ShoppingCart],
  [/food|dining|restaurant|grocer/i, UtensilsCrossed],
  [/util|bill|electric|water|gas\b/i, Zap],
  [/entertain|movie|game|stream/i, Clapperboard],
  [/transport|fuel|car|uber|taxi/i, Car],
  [/travel|flight|trip|hotel/i, Plane],
  [/health|medical|pharmacy|doctor/i, HeartPulse],
  [/invest|dividend|stock|brokerage|trad(e|ing)\b/i, TrendingUp],
  [/electronic|tech|computer|laptop/i, Laptop],
  [/salary|wage|pay\b|paycheck|income|allowance|bonus/i, Banknote],
  [/rent|mortgage|home|deposit|house/i, Home],
  [/drink|beverage|coffee|caf[eé]|juice/i, Coffee],
  [/subscri|membership/i, Repeat],
  [/freelance|contract|consult|gig\b/i, Briefcase],
];

export function categoryIconFor(name?: string | null): LucideIcon {
  if (name) for (const [pattern, I] of RULES) if (pattern.test(name)) return I;
  return Receipt;
}

/** Best-effort icon for a free-form category or merchant name; a receipt when nothing fits. */
export function CategoryIcon({ name, size = 18, color }: { name?: string | null; size?: number; color?: string }) {
  return <Icon as={categoryIconFor(name)} size={size} color={color} aria-hidden />;
}
