import { CategoryGlyph } from "@/components/categories/category-glyph";
import { cn } from "@/lib/utils";
import type { Category } from "@/lib/types";

/** A category's colour tile with its icon in that colour. */
export function CategoryAvatar({
  category,
  className,
}: {
  category: Pick<Category, "name" | "color" | "icon">;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl text-lg", className)}
      style={{ backgroundColor: category.color ? `${category.color}22` : "var(--secondary)" }}
    >
      <CategoryGlyph
        category={category}
        className="size-5"
        style={{ color: category.color || "var(--muted-foreground)" }}
      />
    </span>
  );
}
