"use client";

import * as React from "react";
import { ArchiveRestore, Plus, Tags, Lock, Pencil, Trash2 } from "lucide-react";
import {
  useArchiveCategory,
  useCategories,
  useDeleteCategory,
  useRestoreCategory,
} from "@/hooks/useCategories";
import { CategoryDialog } from "@/components/categories/category-dialog";
import { DeleteCategoryDialog } from "@/components/categories/delete-category-dialog";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/common/states";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CategoryIcon } from "@/components/dashboard/category-icon";
import { cn } from "@/lib/utils";
import type { Category } from "@/lib/types";

type TileActions = {
  onEdit?: (c: Category) => void;
  onDelete?: (c: Category) => void;
  onRestore?: (c: Category) => void;
  /** Id of the category a delete, archive or restore is in flight for. */
  busyId?: string;
};

function CategoryTile({
  category,
  onEdit,
  onDelete,
  onRestore,
  busyId,
}: { category: Category } & TileActions) {
  const busy = busyId === category.id;
  return (
    // `flex-row` is required: Card is `flex-col` by default, so `flex` alone stacks everything vertically.
    <Card
      aria-busy={busy || undefined}
      className={cn(
        "flex-row items-center gap-3 border-0 p-3.5 shadow-sm transition-opacity",
        busy && "opacity-60",
      )}
    >
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-lg text-base"
        style={{
          backgroundColor: category.color ? `${category.color}22` : "var(--secondary)",
        }}
      >
        {category.icon || (
          <CategoryIcon
            name={category.name}
            className="size-4"
            style={{ color: category.color || "var(--muted-foreground)" }}
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
            <span
              tabIndex={0}
              role="img"
              aria-label="System category (read-only)"
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Lock className="size-4" />
            </span>
          </TooltipTrigger>
          <TooltipContent>System category — can&apos;t be edited</TooltipContent>
        </Tooltip>
      ) : onRestore ? (
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          disabled={busy}
          onClick={() => onRestore(category)}
          aria-label={`Restore ${category.name}`}
        >
          <ArchiveRestore className="size-4" />
          Restore
        </Button>
      ) : (
        <>
          {onEdit && (
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
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground"
              disabled={busy}
              onClick={() => onDelete(category)}
              aria-label={`Delete ${category.name}`}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </>
      )}
    </Card>
  );
}

function Section({
  title,
  hint,
  items,
  ...actions
}: {
  title: string;
  hint: string;
  items: Category[];
} & TileActions) {
  if (items.length === 0) return null;
  return (
    <section>
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((c) => (
          <CategoryTile key={c.id} category={c} {...actions} />
        ))}
      </div>
    </section>
  );
}

function TilesSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-[68px] rounded-xl" />
      ))}
    </div>
  );
}

export default function CategoriesPage() {
  const [tab, setTab] = React.useState<"active" | "archived">("active");
  const { data, isLoading, isError, refetch } = useCategories("active");
  const archived = useCategories("archived", tab === "archived");
  const deleteCategory = useDeleteCategory();
  const archiveCategory = useArchiveCategory();
  const restoreCategory = useRestoreCategory();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Category | undefined>();
  const [toDelete, setToDelete] = React.useState<Category | undefined>();

  function openCreate() {
    setEditing(undefined);
    setOpen(true);
  }
  function openEdit(c: Category) {
    setEditing(c);
    setOpen(true);
  }

  // The tile stays until the server confirms; it's only dimmed meanwhile.
  const busyId =
    (deleteCategory.isPending && deleteCategory.variables) ||
    (archiveCategory.isPending && archiveCategory.variables) ||
    (restoreCategory.isPending && restoreCategory.variables) ||
    undefined;

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

      <Tabs value={tab} onValueChange={(v) => setTab(v as "active" | "archived")}>
        <TabsList>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="archived">Archived</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-6">
          {isLoading ? (
            <TilesSkeleton />
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
                onDelete={setToDelete}
                busyId={busyId}
              />
              <Section
                title="System categories"
                hint="read-only"
                items={systemCategories}
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="archived" className="mt-6">
          {archived.isLoading ? (
            <TilesSkeleton />
          ) : archived.isError ? (
            <ErrorState
              description="Couldn't load your archived categories."
              onRetry={() => archived.refetch()}
            />
          ) : !archived.data || archived.data.length === 0 ? (
            <EmptyState
              icon={Tags}
              title="No archived categories"
              description="Categories you archive are hidden from pickers but stay on past transactions. They'll show up here."
            />
          ) : (
            <Section
              title="Archived"
              hint="hidden from pickers, kept on past transactions"
              items={archived.data}
              onRestore={(c) => restoreCategory.mutate(c.id)}
              busyId={busyId}
            />
          )}
        </TabsContent>
      </Tabs>

      <CategoryDialog open={open} onOpenChange={setOpen} category={editing} />

      <DeleteCategoryDialog
        category={toDelete}
        onOpenChange={(o) => !o && setToDelete(undefined)}
        onDelete={(c) => {
          setToDelete(undefined);
          deleteCategory.mutate(c.id);
        }}
        onArchive={(c) => {
          setToDelete(undefined);
          archiveCategory.mutate(c.id);
        }}
      />
    </>
  );
}
