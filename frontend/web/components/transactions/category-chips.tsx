"use client";

import { Plus } from "lucide-react";
import { CategoryGlyph } from "@/components/categories/category-glyph";
import { cn } from "@/lib/utils";
import type { Category } from "@/lib/types";

/**
 * One-tap category picker: a horizontally scrolling row of chips. Tapping the
 * selected chip again clears it (category is optional).
 */
export function CategoryChips({
  categories,
  value,
  onChange,
  onCreate,
}: {
  categories: Category[];
  value?: string;
  onChange: (id?: string) => void;
  onCreate: () => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Category"
      className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {categories.map((c) => {
        const selected = c.id === value;
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(selected ? undefined : c.id)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm pointer-coarse:min-h-11 transition-colors",
              selected
                ? "bg-foreground text-background"
                : "bg-background/70 text-muted-foreground hover:text-foreground",
            )}
          >
            <CategoryGlyph category={c} className="size-3.5" />
            {c.name}
          </button>
        );
      })}
      <button
        type="button"
        onClick={onCreate}
        className="flex shrink-0 items-center gap-1 rounded-full pointer-coarse:min-h-11 border border-dashed border-border px-3.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <Plus className="size-3.5" />
        New
      </button>
    </div>
  );
}
