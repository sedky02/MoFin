"use client";

import * as React from "react";
import { Archive, ArchiveRestore, ArrowLeft, Plus, Search, Tags, Lock, Pencil } from "lucide-react";
import {
  useArchiveCategory,
  useCategories,
  useRestoreCategory,
} from "@/hooks/useCategories";
import { CategoryDialog } from "@/components/categories/category-dialog";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/common/states";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CategoryAvatar } from "@/components/categories/category-avatar";
import { cn } from "@/lib/utils";
import type { Category } from "@/lib/types";

type RowActions = {
  onEdit?: (c: Category) => void;
  onArchive?: (c: Category) => void;
  onRestore?: (c: Category) => void;
  busyId?: string;
};

function CategoryRow({
  category,
  onEdit,
  onArchive,
  onRestore,
  busyId,
}: { category: Category } & RowActions) {
  const busy = busyId === category.id;
  // Quiet until you point at the row or move focus into it; on touch screens there is no
  // hover, so the actions stay visible there.
  const reveal =
    "transition-opacity sm:opacity-0 sm:group-hover/row:opacity-100 sm:group-focus-within/row:opacity-100 pointer-coarse:opacity-100";
  return (
    <li
      aria-busy={busy || undefined}
      className={cn("group/row flex items-center gap-3 px-4 py-2.5 transition-opacity", busy && "opacity-60")}
    >
      <CategoryAvatar category={category} />
      <p className="min-w-0 flex-1 truncate text-sm font-medium">{category.name}</p>
      {category.isSystem ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              tabIndex={0}
              role="img"
              aria-label="System category (read-only)"
              className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Lock className="size-3.5" />
              System
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
        <div className={cn("flex items-center", reveal)}>
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
          {onArchive && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={busy}
              onClick={() => onArchive(category)}
              aria-label={`Archive ${category.name}`}
              title="Archive"
            >
              <Archive className="size-4" />
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function Group({
  title,
  hint,
  items,
  ...actions
}: {
  title: string;
  hint?: string;
  items: Category[];
} & RowActions) {
  if (items.length === 0) return null;
  return (
    <Card className="gap-0 border-0 py-0">
      <div className="flex items-baseline justify-between gap-3 px-4 pb-2 pt-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground">{hint ?? items.length}</span>
      </div>
      <ul className="divide-y divide-border pb-1">
        {items.map((c) => (
          <CategoryRow key={c.id} category={c} {...actions} />
        ))}
      </ul>
    </Card>
  );
}

function ListSkeleton() {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      {[4, 3].map((rows, i) => (
        <Card key={i} className="gap-0 border-0 p-4">
          <Skeleton className="mb-4 h-4 w-24" />
          <div className="space-y-3">
            {Array.from({ length: rows }).map((_, j) => (
              <div key={j} className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-xl" />
                <Skeleton className="h-4 w-32" />
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

export default function CategoriesPage() {
  const [view, setView] = React.useState<"active" | "archived">("active");
  const { data, isLoading, isError, refetch } = useCategories("active");
  const archived = useCategories("archived");
  const archiveCategory = useArchiveCategory();
  const restoreCategory = useRestoreCategory();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Category | undefined>();
  const [toArchive, setToArchive] = React.useState<Category | undefined>();

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
    (archiveCategory.isPending && archiveCategory.variables) ||
    (restoreCategory.isPending && restoreCategory.variables) ||
    undefined;

  // Typing in the filter narrows whichever tab is open; it only appears once the list is long enough to need it.
  const [query, setQuery] = React.useState("");
  const matches = (c: Category) => c.name.toLowerCase().includes(query.trim().toLowerCase());
  const active = (data ?? []).filter(matches);
  const archivedList = (archived.data ?? []).filter(matches);
  const expenses = active.filter((c) => c.type === "EXPENSE");
  const income = active.filter((c) => c.type === "INCOME");
  const archivedCount = archived.data?.length ?? 0;
  const showFilter = (data?.length ?? 0) + (archived.data?.length ?? 0) > 6;
  const noMatches = (
    <p className="py-10 text-center text-sm text-muted-foreground">No categories match &ldquo;{query.trim()}&rdquo;.</p>
  );

  return (
    <>
      <PageHeader
        title="Categories"
        description="Organize your transactions. System categories are read-only."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {view === "active" ? (
              <Button variant="outline" onClick={() => setView("archived")} className="gap-2">
                <Archive className="size-4" aria-hidden />
                {archivedCount > 0 ? `Archived (${archivedCount})` : "Archived"}
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setView("active")} className="gap-2">
                <ArrowLeft className="size-4" aria-hidden />
                Back to categories
              </Button>
            )}
            <Button onClick={openCreate} className="gap-2">
              <Plus className="size-4" />
              New category
            </Button>
          </div>
        }
      />

      {showFilter && (
        <div className="relative w-full sm:w-72">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter categories"
            aria-label="Filter categories"
            className="pl-9"
          />
        </div>
      )}

      <div className={showFilter ? "mt-5" : undefined}>
        {view === "active" ? (
          isLoading ? (
            <ListSkeleton />
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
          ) : active.length === 0 ? (
            noMatches
          ) : (
            <div className="grid items-start gap-4 lg:grid-cols-2">
              <Group title="Expenses" items={expenses} onEdit={openEdit} onArchive={setToArchive} busyId={busyId} />
              <Group title="Income" items={income} onEdit={openEdit} onArchive={setToArchive} busyId={busyId} />
            </div>
          )
        ) : archived.isLoading ? (
          <ListSkeleton />
        ) : archived.isError ? (
          <ErrorState
            description="Couldn't load your archived categories."
            onRetry={() => archived.refetch()}
          />
        ) : archivedCount === 0 ? (
          <EmptyState
            icon={Tags}
            title="No archived categories"
            description="Categories you archive are hidden from pickers but stay on past transactions. They'll show up here."
          />
        ) : archivedList.length === 0 ? (
          noMatches
        ) : (
          <div className="max-w-2xl">
            <Group
              title="Archived"
              hint="hidden from pickers, kept on past transactions"
              items={archivedList}
              onRestore={(c) => restoreCategory.mutate(c.id)}
              busyId={busyId}
            />
          </div>
        )}
      </div>

      <CategoryDialog open={open} onOpenChange={setOpen} category={editing} />
      <ConfirmDialog
        open={!!toArchive}
        onOpenChange={(o) => !o && setToArchive(undefined)}
        title={`Archive "${toArchive?.name ?? ""}"?`}
        description="It will be hidden from pickers but stay on past transactions. You can restore it any time from Archived."
        confirmLabel="Archive"
        destructive
        onConfirm={() => {
          if (toArchive) archiveCategory.mutate(toArchive.id);
          setToArchive(undefined);
        }}
      />
    </>
  );
}
