"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/common/submit-button";
import { handleApiError } from "@/lib/form-errors";

/** The word to type, and the value the backend's `confirm` field must carry. */
export const CONFIRM_WORD = "DELETE";

const schema = z.object({
  confirmText: z
    .string()
    .refine((v) => v.trim() === CONFIRM_WORD, { message: `Type ${CONFIRM_WORD} to confirm.` }),
});
type Values = z.infer<typeof schema>;

/**
 * A destructive action behind a typed word. There is no password to ask for (a Google-only
 * account has none), so the word is what stops a stray click. `onConfirm` does the work and
 * throws on failure, which shows as a toast; on success the dialog closes itself unless
 * `closeWhenDone` is false, for an action that navigates away.
 */
export function TypeToConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  actionLabel,
  pendingText,
  failureMessage,
  closeWhenDone = true,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  actionLabel: string;
  pendingText: string;
  failureMessage: string;
  closeWhenDone?: boolean;
  onConfirm: () => Promise<void>;
}) {
  const [pending, setPending] = React.useState(false);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { confirmText: "" } });

  function changeOpen(next: boolean) {
    if (pending) return;
    if (!next) form.reset();
    onOpenChange(next);
  }

  async function action() {
    const valid = await form.trigger(undefined, { shouldFocus: true });
    if (!valid) return;
    setPending(true);
    try {
      await onConfirm();
    } catch (err) {
      setPending(false);
      handleApiError(err, { fallback: failureMessage });
      return;
    }
    if (closeWhenDone) {
      setPending(false);
      form.reset();
      onOpenChange(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={changeOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <Form {...form}>
          <form action={action} className="grid gap-4" aria-label={actionLabel}>
            <FormField
              control={form.control}
              name="confirmText"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type {CONFIRM_WORD} to confirm</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" autoCapitalize="characters" spellCheck={false} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
              <SubmitButton
                pendingText={pendingText}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {actionLabel}
              </SubmitButton>
            </AlertDialogFooter>
          </form>
        </Form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
