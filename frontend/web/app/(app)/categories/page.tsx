"use client";

import * as React from "react";
import { Plus, Tags, Lock, Pencil } from "lucide-react";
import { useCategories } from "@/hooks/useCategories";
import { CategoryDialog } from "@/components/categories/category-dialog";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/common/states";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Category } from "@/lib/types";

function CategoryTile({
  category,
  onEdit,
}: {
  category: Category;
  onEdit: (c: Category) => void;
}) {
  return (
    <Card className="flex items-center gap-3 border-0 p-3.5 shadow-sm">
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-lg text-base"
        style={{
          backgroundColor: category.color ? `${category.color}22` : "var(--secondary)",
        }}
      >
        {category.icon || (
          <span
            className="size-2.5 rounded-full"
            style={{ backgroundColor: category.color || "var(--muted-foreground)" }}
          />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{category.name}</p>
        <p
          className={cn(
            "text-xs",
            category.type === "INCOME" ? "text-success" : "text-muted-foreground",
          )}
        >
          {category.type === "INCOME" ? "Income" : "Expense"}
        </p>
      </div>
      {category.isSystem ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground"
                disabled
                aria-label="System category (read-only)"
              >
                <Lock className="size-4" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>System category — can&apos;t be edited</TooltipContent>
        </Tooltip>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground"
          onClick={() => onEdit(category)}
          aria-label={`Edit ${category.name}`}
        >
          <Pencil className="size-4" />
        </Button>
      )}
    </Card>
  );
}

function Section({
  title,
  hint,
  items,
  onEdit,
}: {
  title: string;
  hint: string;
  items: Category[];
  onEdit: (c: Category) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((c) => (
          <CategoryTile key={c.id} category={c} onEdit={onEdit} />
        ))}
      </div>
    </section>
  );
}

export default function CategoriesPage() {
  const { data, isLoading, isError, refetch } = useCategories();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Category | undefined>();

  function openCreate() {
    setEditing(undefined);
    setOpen(true);
  }
  function openEdit(c: Category) {
    setEditing(c);
    setOpen(true);
  }

  const userCategories = (data ?? []).filter((c) => !c.isSystem);
  const systemCategories = (data ?? []).filter((c) => c.isSystem);

  return (
    <>
      <PageHeader
        title="Categories"
        description="Organize transactions. System categories are read-only."
        action={
          <Button onClick={openCreate} className="gap-2">
            <Plus className="size-4" />
            New category
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[68px] rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState description="Couldn't load categories." onRetry={() => refetch()} />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          icon={Tags}
          title="No categories yet"
          description="Create a category to start organizing your spending."
          action={
            <Button onClick={openCreate} className="gap-2">
              <Plus className="size-4" />
              New category
            </Button>
          }
        />
      ) : (
        <div className="space-y-8">
          <Section
            title="Your categories"
            hint={`${userCategories.length}`}
            items={userCategories}
            onEdit={openEdit}
          />
          <Section
            title="System categories"
            hint="read-only"
            items={systemCategories}
            onEdit={openEdit}
          />
        </div>
      )}

      <CategoryDialog open={open} onOpenChange={setOpen} category={editing} />
    </>
  );
}
