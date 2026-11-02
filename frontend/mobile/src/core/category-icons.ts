import {
  Baby,
  Banknote,
  Briefcase,
  Bus,
  Car,
  Clapperboard,
  Coffee,
  Droplets,
  Dumbbell,
  Gamepad2,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  Landmark,
  PawPrint,
  PiggyBank,
  Plane,
  Scissors,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  TrendingUp,
  Utensils,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react-native";

/**
 * The icons a category can wear. A category stores the `key`; older categories
 * stored an emoji instead, and those still display (see CategoryGlyph).
 */
export const CATEGORY_ICONS: {
  key: string;
  label: string;
  Icon: LucideIcon;
}[] = [
  { key: "cart", label: "Groceries", Icon: ShoppingCart },
  { key: "bag", label: "Shopping", Icon: ShoppingBag },
  { key: "food", label: "Food", Icon: Utensils },
  { key: "coffee", label: "Coffee", Icon: Coffee },
  { key: "home", label: "Home", Icon: House },
  { key: "utilities", label: "Utilities", Icon: Zap },
  { key: "water", label: "Water", Icon: Droplets },
  { key: "internet", label: "Internet", Icon: Wifi },
  { key: "phone", label: "Phone", Icon: Smartphone },
  { key: "bus", label: "Public transport", Icon: Bus },
  { key: "car", label: "Car", Icon: Car },
  { key: "travel", label: "Travel", Icon: Plane },
  { key: "entertainment", label: "Entertainment", Icon: Clapperboard },
  { key: "games", label: "Games", Icon: Gamepad2 },
  { key: "gift", label: "Gifts", Icon: Gift },
  { key: "health", label: "Health", Icon: HeartPulse },
  { key: "fitness", label: "Fitness", Icon: Dumbbell },
  { key: "beauty", label: "Beauty", Icon: Scissors },
  { key: "clothes", label: "Clothes", Icon: Shirt },
  { key: "education", label: "Education", Icon: GraduationCap },
  { key: "kids", label: "Kids", Icon: Baby },
  { key: "pets", label: "Pets", Icon: PawPrint },
  { key: "repairs", label: "Repairs", Icon: Wrench },
  { key: "work", label: "Work", Icon: Briefcase },
  { key: "salary", label: "Salary", Icon: Banknote },
  { key: "savings", label: "Savings", Icon: PiggyBank },
  { key: "investments", label: "Investments", Icon: TrendingUp },
  { key: "bank", label: "Bank", Icon: Landmark },
];

const BY_KEY = new Map(CATEGORY_ICONS.map((i) => [i.key, i]));

/** The registered icon for a stored value, or undefined for an emoji, a blank, or anything unknown. */
export function categoryIconFor(value: string | null | undefined) {
  return value ? BY_KEY.get(value) : undefined;
}

/** Icons that suit income categories; they lead the list when the category is an income. */
const INCOME_KEYS = [
  "salary",
  "work",
  "investments",
  "savings",
  "bank",
  "gift",
];

/** The icons ordered for a category type, so the likeliest picks come first. */
export function orderedCategoryIcons(type: "INCOME" | "EXPENSE") {
  if (type !== "INCOME") return CATEGORY_ICONS;
  const first = INCOME_KEYS.flatMap((key) => BY_KEY.get(key) ?? []);
  return [
    ...first,
    ...CATEGORY_ICONS.filter((icon) => !INCOME_KEYS.includes(icon.key)),
  ];
}

/**
 * The icons to show while the list is collapsed: the first `count`, with the
 * selected icon swapped into the last slot if it would otherwise be hidden.
 */
export function collapsedCategoryIcons<T extends { key: string }>(
  icons: T[],
  selected: string | undefined,
  count: number,
) {
  const shown = icons.slice(0, count);
  const hiddenSelected = selected
    ? icons.slice(count).find((icon) => icon.key === selected)
    : undefined;
  if (hiddenSelected) shown[shown.length - 1] = hiddenSelected;
  return shown;
}
