import * as React from "react";
import { CategoryIcon } from "@/components/dashboard/category-icon";
import { categoryIconFor } from "@/lib/category-icons";
import type { Category } from "@/lib/types";

/**
 * A category's icon, wherever it is shown. A chosen icon renders as a line
 * icon; an emoji saved by an older version still shows as that emoji; with
 * neither, one is picked from the name. Decorative: the name next to it labels it.
 */
export function CategoryGlyph({
  category,
  className,
  style,
}: {
  category: Pick<Category, "name" | "icon">;
  className?: string;
  style?: React.CSSProperties;
}) {
  const chosen = categoryIconFor(category.icon);
  if (chosen) return <chosen.Icon aria-hidden className={className} style={style} />;
  if (category.icon) {
    return (
      <span aria-hidden style={style}>
        {category.icon}
      </span>
    );
  }
  return <CategoryIcon name={category.name} className={className} style={style} />;
}
