"use client";

import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCategoryUsage } from "@/hooks/useCategories";
import { describeCategoryUsage, isCategoryInUse } from "@/lib/category-usage";
import type { Category } from "@/lib/types";

const DESTRUCTIVE = "bg-destructive text-destructive-foreground hover:bg-destructive/90";

interface View {
  title: string;
  description: string;
  canDelete: boolean;
  canArchive: boolean;
}

/**
 * Checks what uses the category before offering anything: an unused one can
 * be deleted, a used one can only be archived (the backend refuses the
 * delete), so the user learns that up front instead of after confirming.
 */
export function DeleteCategoryDialog({
  category,
  onOpenChange,
  onDelete,
  onArchive,
}: {
  category: Category | undefined;
  onOpenChange: (open: boolean) => void;
  onDelete: (c: Category) => void;
  onArchive: (c: Category) => void;
}) {
  const usage = useCategoryUsage(category?.id);
  const inUse = usage.data ? isCategoryInUse(usage.data) : false;

  let view: View | undefined;
  if (category) {
    const name = category.name;
    view = {
      title: `Delete "${name}"?`,
      description: "Checking whether any transactions use this category…",
      canDelete: !!usage.data && !inUse,
      canArchive: inUse || usage.isError,
    };
    if (usage.isError) {
      view.description =
        "Couldn't check whether any transactions use this category. Archiving is always safe: it hides the category from pickers and keeps it on past transactions.";
    } else if (usage.data && inUse) {
      view.title = `Archive "${name}"?`;
      view.description = `${describeCategoryUsage(usage.data)}, so it can't be deleted. Archive it instead: it's hidden from pickers and stays on those transactions. You can restore it from Archived.`;
    } else if (usage.data) {
      view.description = "No transactions use this category. Deleting it removes it for good.";
    }
  }

  // Keep the last content while the dialog animates closed, instead of it
  // blanking out once `category` is cleared.
  const [lastView, setLastView] = React.useState<View | undefined>(view);
  if (view && JSON.stringify(view) !== JSON.stringify(lastView)) setLastView(view);
  const { title = "", description = "", canDelete = false, canArchive = false } = view ?? lastView ?? {};

  return (
    <AlertDialog open={!!category} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription aria-live="polite">{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          {canArchive ? (
            <AlertDialogAction onClick={() => category && onArchive(category)}>Archive</AlertDialogAction>
          ) : (
            <AlertDialogAction
              disabled={!canDelete}
              onClick={() => category && onDelete(category)}
              className={DESTRUCTIVE}
            >
              Delete
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
