"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/common/submit-button";
import { cn } from "@/lib/utils";
import { CATEGORY_COLORS } from "@/lib/constants";
import { useCreateCategory, useUpdateCategory } from "@/hooks/useCategories";
import type { Category } from "@/lib/types";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(40),
  type: z.enum(["INCOME", "EXPENSE"]),
  color: z.string().trim().optional(),
  icon: z.string().trim().max(4).optional(),
});
type Values = z.infer<typeof schema>;

export function CategoryDialog({
  open,
  onOpenChange,
  category,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: Category;
}) {
  const isEdit = !!category;
  const createMut = useCreateCategory();
  const updateMut = useUpdateCategory();

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: category?.name ?? "",
      type: category?.type ?? "EXPENSE",
      color: category?.color ?? CATEGORY_COLORS[0],
      icon: category?.icon ?? "",
    },
  });

  React.useEffect(() => {
    if (open) {
      form.reset({
        name: category?.name ?? "",
        type: category?.type ?? "EXPENSE",
        color: category?.color ?? CATEGORY_COLORS[0],
        icon: category?.icon ?? "",
      });
    }
  }, [open, category, form]);

  const selectedColor = form.watch("color");
  const selectedType = form.watch("type");

  async function action() {
    const valid = await form.trigger();
    if (!valid) return;
    const v = form.getValues();
    try {
      if (isEdit) {
        await updateMut.mutateAsync({
          id: category.id,
          name: v.name,
          color: v.color,
          icon: v.icon || undefined,
        });
      } else {
        await createMut.mutateAsync({
          name: v.name,
          type: v.type,
          color: v.color,
          icon: v.icon || undefined,
        });
      }
      onOpenChange(false);
    } catch {
      /* hook toasts on error */
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit category" : "New category"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this category's appearance."
              : "Create a category to organize transactions."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form action={action} className="space-y-4">
            <div className="flex items-start gap-3">
              <FormField
                control={form.control}
                name="icon"
                render={({ field }) => (
                  <FormItem className="w-20">
                    <FormLabel>Icon</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="🍔"
                        maxLength={4}
                        className="text-center text-lg"
                        {...field}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Groceries" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Type — only editable on create (PATCH doesn't change type). */}
            {!isEdit && (
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <div className="grid grid-cols-2 gap-2">
                      {(["EXPENSE", "INCOME"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => field.onChange(t)}
                          className={cn(
                            "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                            selectedType === t
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:bg-secondary",
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

            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Color</FormLabel>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORY_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={`Pick color ${c}`}
                        aria-pressed={selectedColor === c}
                        onClick={() => field.onChange(c)}
                        className={cn(
                          "size-7 rounded-full ring-2 ring-offset-2 ring-offset-background transition-all",
                          selectedColor === c ? "ring-foreground/60" : "ring-transparent",
                        )}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <SubmitButton pendingText="Saving…">
                {isEdit ? "Save changes" : "Create category"}
              </SubmitButton>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
