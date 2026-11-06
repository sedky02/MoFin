import type { LucideIcon } from 'lucide-react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { categoryIconFor } from '@/core/category-icons';
import type { Category } from '@/core/types';
import { Banknote, Briefcase, Bus, Car, Clapperboard, Coffee, Droplets, Dumbbell, Gamepad2, HeartPulse, House, Laptop, Plane, Receipt, Repeat, ShoppingBag, ShoppingCart, Smartphone, Tags, TrendingUp, Utensils, Wifi, Zap } from '@/lib/icons';

/**
 * Icons guessed from a name when a category has no icon of its own. They use the same glyphs as the
 * icon picker (`CATEGORY_ICONS`) where the two overlap, so a guessed icon and a picked one match.
 */
const NAME_RULES: [RegExp, LucideIcon][] = [
  [/grocer|supermarket/i, ShoppingCart],
  [/shop|retail|store/i, ShoppingBag],
  [/food|dining|restaurant|meal|lunch|dinner/i, Utensils],
  [/drink|beverage|coffee|caf[eé]|juice|bar\b/i, Coffee],
  [/water/i, Droplets],
  [/internet|wifi|broadband/i, Wifi],
  [/phone|mobile plan/i, Smartphone],
  [/util|bill|electric|gas\b/i, Zap],
  [/entertain|movie|cinema|stream/i, Clapperboard],
  [/game/i, Gamepad2],
  [/bus|metro|train|transit|public transport/i, Bus],
  [/transport|fuel|car|uber|taxi/i, Car],
  [/travel|flight|trip|hotel/i, Plane],
  [/health|medical|pharmacy|doctor/i, HeartPulse],
  [/gym|fitness|sport/i, Dumbbell],
  [/invest|dividend|stock|brokerage|trad(e|ing)\b/i, TrendingUp],
  [/electronic|tech|computer|laptop/i, Laptop],
  [/salary|wage|\bpay\b|paycheck|income|allowance|bonus/i, Banknote],
  [/rent|mortgage|home|house/i, House],
  [/subscri|membership/i, Repeat],
  [/freelance|contract|consult|gig\b/i, Briefcase],
];

function iconForName(name?: string | null): LucideIcon | undefined {
  if (!name) return undefined;
  for (const [pattern, I] of NAME_RULES) if (pattern.test(name)) return I;
  return undefined;
}

export type CategoryGlyph = { kind: 'icon'; Icon: LucideIcon } | { kind: 'emoji'; emoji: string };

/**
 * Drawn the same everywhere: the picked icon, else an older emoji, else an icon guessed from the
 * name (or `fallbackName`), else a tag or receipt.
 */
export function categoryGlyph(category?: Pick<Category, 'icon' | 'name'> | null, fallbackName?: string | null): CategoryGlyph {
  const registered = categoryIconFor(category?.icon);
  if (registered) return { kind: 'icon', Icon: registered.Icon };
  if (category?.icon) return { kind: 'emoji', emoji: category.icon };
  const guessed = iconForName(category?.name ?? fallbackName);
  return { kind: 'icon', Icon: guessed ?? (category ? Tags : Receipt) };
}

export function CategoryGlyphIcon({
  category,
  fallbackName,
  size = 18,
  color,
}: {
  category?: Pick<Category, 'icon' | 'name'> | null;
  fallbackName?: string | null;
  size?: number;
  color?: string;
}) {
  const glyph = categoryGlyph(category, fallbackName);
  if (glyph.kind === 'emoji') {
    return (
      <Text aria-hidden style={{ fontSize: size, lineHeight: size + 4 }}>
        {glyph.emoji}
      </Text>
    );
  }
  return <Icon as={glyph.Icon} size={size} color={color} aria-hidden />;
}

export function categoryTint(color?: string | null): string | undefined {
  return color && /^#[0-9a-f]{6}$/i.test(color) ? `${color}22` : undefined;
}
