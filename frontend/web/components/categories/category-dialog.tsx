"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, ChevronDown, X } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/common/submit-button";
import { CategoryAvatar } from "@/components/categories/category-avatar";
import { ApiClientError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CATEGORY_COLORS, CATEGORY_COLOR_NAMES } from "@/lib/constants";
import { categoryIconFor, collapsedCategoryIcons, orderedCategoryIcons } from "@/lib/category-icons";
import { useCreateCategory, useUpdateCategory } from "@/hooks/useCategories";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { Category, CategoryType } from "@/lib/types";

const NAME_MAX = 40;
/** Two rows of the seven-column grid, one row on a phone so the whole dialog fits the screen. */
const COLLAPSED_ICONS = 14;
const COLLAPSED_ICONS_PHONE = 7;

const schema = z.object({
  name: z.string().trim().min(1, "Give the category a name.").max(NAME_MAX, `Keep it under ${NAME_MAX} characters.`),
  type: z.enum(["INCOME", "EXPENSE"]),
  color: z.string().trim().optional(),
  // An icon key, an emoji kept from an older version, or empty to pick one from the name.
  icon: z.string().optional(),
});
type Values = z.infer<typeof schema>;

export function CategoryDialog({
  open,
  onOpenChange,
  category,
  defaultType,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: Category;
  defaultType?: CategoryType;
  onCreated?: (category: Category) => void;
}) {
  const isEdit = !!category;
  const createMut = useCreateCategory();
  const updateMut = useUpdateCategory();
  const nameRef = React.useRef<HTMLInputElement | null>(null);
  const [showAllIcons, setShowAllIcons] = React.useState(false);
  const phone = useMediaQuery("(max-width: 639px)");
  const collapsedCount = phone ? COLLAPSED_ICONS_PHONE : COLLAPSED_ICONS;

  const initial = React.useCallback(
    (): Values => ({
      name: category?.name ?? "",
      type: category?.type ?? defaultType ?? "EXPENSE",
      color: category?.color ?? CATEGORY_COLORS[0],
      icon: category?.icon ?? "",
    }),
    [category, defaultType],
  );

  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initial() });

  React.useEffect(() => {
    if (open) {
      form.reset(initial());
      setShowAllIcons(false);
    }
  }, [open, initial, form]);

  const color = form.watch("color");
  const type = form.watch("type");
  const name = form.watch("name");
  const icon = form.watch("icon") ?? "";

  async function action() {
    const valid = await form.trigger(undefined, { shouldFocus: true });
    if (!valid) return;
    const v = form.getValues();
    try {
      if (isEdit) {
        await updateMut.mutateAsync({ id: category.id, name: v.name, color: v.color, icon: v.icon || undefined });
      } else {
        const created = await createMut.mutateAsync({
          name: v.name,
          type: v.type,
          color: v.color,
          icon: v.icon || undefined,
        });
        onCreated?.(created);
      }
      onOpenChange(false);
    } catch (err) {
      // The name is taken: say so on the field, where the fix is. Anything else was toasted by the hook.
      if (err instanceof ApiClientError && err.status === 409) {
        form.setError("name", {
          type: "server",
          message: `You already have ${v.type === "INCOME" ? "an income" : "an expense"} category called “${v.name}”.`,
        });
        form.setFocus("name");
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // Header and footer stay put; only the form body scrolls, so a short screen never clips the buttons.
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
        // The close button lives in the header row (below), level with the title like the footer's buttons.
        showCloseButton={false}
        // The name is the one thing everyone fills in, so the cursor starts there.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          nameRef.current?.focus();
        }}
      >
        <DialogHeader className="flex-row items-center gap-3 border-b px-4 py-3 sm:gap-3.5 sm:px-6 sm:py-4">
          <CategoryAvatar category={{ name: name || "Category", color, icon }} className="size-10 sm:size-12" />
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-base sm:text-lg">{isEdit ? "Edit category" : "New category"}</DialogTitle>
            <DialogDescription className="mt-1 max-sm:hidden">
              {isEdit ? "Change how this category looks." : "Create a category to organize transactions."}
            </DialogDescription>
          </div>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground">
              <X aria-hidden />
              <span className="sr-only">Close</span>
            </Button>
          </DialogClose>
        </DialogHeader>

        <Form {...form}>
          <form action={action} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:space-y-6 sm:px-6 sm:py-5">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. Groceries"
                        maxLength={NAME_MAX + 10}
                        autoComplete="off"
                        {...field}
                        ref={(el) => {
                          field.ref(el);
                          nameRef.current = el;
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {!isEdit && (
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type</FormLabel>
                      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                        {(["EXPENSE", "INCOME"] as const).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => field.onChange(t)}
                            aria-pressed={type === t}
                            className={cn(
                              "min-h-9 rounded-md px-3 text-sm font-medium transition-colors",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              type === t
                                ? "bg-card text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {t === "EXPENSE" ? "Expense" : "Income"}
                          </button>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <div className="space-y-3 rounded-xl bg-muted/40 p-3 sm:space-y-5 sm:p-4">
                <FormField
                  control={form.control}
                  name="icon"
                  render={({ field }) => {
                    // An emoji saved by an older version isn't in the set; keep it as a choice so editing doesn't lose it.
                    const legacy = field.value && !categoryIconFor(field.value) ? field.value : undefined;
                    const icons = orderedCategoryIcons(type);
                    const shown = showAllIcons ? icons : collapsedCategoryIcons(icons, field.value, legacy ? collapsedCount - 1 : collapsedCount);
                    const tile = (selected: boolean) =>
                      cn(
                        "grid aspect-square w-full place-items-center rounded-lg bg-card text-muted-foreground transition-shadow",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        selected
                          ? "text-foreground ring-2 ring-primary"
                          : "ring-1 ring-border hover:text-foreground hover:ring-foreground/30",
                      );
                    return (
                      <FormItem>
                        <div className="flex items-center justify-between gap-3">
                          <FormLabel>Icon</FormLabel>
                          <button
                            type="button"
                            aria-pressed={!field.value}
                            onClick={() => field.onChange("")}
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              !field.value
                                ? "text-primary-text"
                                : "text-muted-foreground hover:bg-card hover:text-foreground",
                            )}
                          >
                            {!field.value && <Check className="size-3.5" aria-hidden />}
                            Choose from the name
                          </button>
                        </div>
                        <div id="category-icons" role="group" aria-label="Icon" className="grid grid-cols-7 gap-2">
                          {legacy && (
                            <button
                              type="button"
                              aria-label={`Keep ${legacy}`}
                              aria-pressed
                              onClick={() => field.onChange(legacy)}
                              className={cn(tile(true), "text-lg")}
                            >
                              {legacy}
                            </button>
                          )}
                          {shown.map(({ key, label, Icon }) => {
                            const selected = field.value === key;
                            return (
                              <button
                                key={key}
                                type="button"
                                aria-label={label}
                                title={label}
                                aria-pressed={selected}
                                onClick={() => field.onChange(key)}
                                className={tile(selected)}
                              >
                                <Icon className="size-5" style={selected ? { color } : undefined} aria-hidden />
                              </button>
                            );
                          })}
                        </div>
                        <button
                          type="button"
                          aria-expanded={showAllIcons}
                          aria-controls="category-icons"
                          onClick={() => setShowAllIcons((v) => !v)}
                          className={cn(
                            "mx-auto flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors",
                            "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          )}
                        >
                          {showAllIcons ? "Show fewer icons" : `Show all ${icons.length} icons`}
                          <ChevronDown className={cn("size-3.5 transition-transform", showAllIcons && "rotate-180")} aria-hidden />
                        </button>
                        <FormDescription className="max-sm:hidden">Pick an icon, or let MoFin choose one from the name.</FormDescription>
                      </FormItem>
                    );
                  }}
                />

                <FormField
                  control={form.control}
                  name="color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Color</FormLabel>
                      <div className="grid grid-cols-5 gap-y-2 sm:grid-cols-10 sm:gap-y-3">
                        {CATEGORY_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            aria-label={CATEGORY_COLOR_NAMES[c] ?? c}
                            title={CATEGORY_COLOR_NAMES[c] ?? c}
                            aria-pressed={color === c}
                            onClick={() => field.onChange(c)}
                            className={cn(
                              "mx-auto grid size-8 place-items-center rounded-full text-white ring-2 ring-offset-2 ring-offset-muted transition-shadow",
                              "focus-visible:outline-none focus-visible:ring-ring",
                              color === c ? "ring-foreground/60" : "ring-transparent hover:ring-foreground/20",
                            )}
                            style={{ backgroundColor: c }}
                          >
                            {color === c && <Check className="size-4" aria-hidden />}
                          </button>
                        ))}
                      </div>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <DialogFooter className="m-0 flex-row justify-end gap-2 px-4 py-3 sm:gap-2 sm:px-6 sm:py-4">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <SubmitButton pendingText="Saving…">{isEdit ? "Save changes" : "Create category"}</SubmitButton>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
