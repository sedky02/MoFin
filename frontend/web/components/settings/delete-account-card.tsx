"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
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
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PasswordInput } from "@/components/common/password-input";
import { SubmitButton } from "@/components/common/submit-button";
import { authApi } from "@/lib/api";
import { handleApiError } from "@/lib/form-errors";
import type { User } from "@/lib/types";

const CONFIRM_WORD = "DELETE";

// The password for a password account, the account's email for a Google-only
// one (it has no password). The backend checks whichever applies.
function deleteSchema(hasPassword: boolean) {
  return z
    .object({
      confirmText: z.string(),
      password: z.string(),
      confirmEmail: z.string(),
    })
    .superRefine((v, ctx) => {
      if (v.confirmText.trim() !== CONFIRM_WORD) {
        ctx.addIssue({ code: "custom", path: ["confirmText"], message: `Type ${CONFIRM_WORD} to confirm.` });
      }
      if (hasPassword && !v.password) {
        ctx.addIssue({ code: "custom", path: ["password"], message: "Enter your password." });
      }
      if (!hasPassword && !v.confirmEmail.trim()) {
        ctx.addIssue({ code: "custom", path: ["confirmEmail"], message: "Type your account's email." });
      }
    });
}
type DeleteValues = z.infer<ReturnType<typeof deleteSchema>>;

export function DeleteAccountCard({ user, isLoading }: { user?: User; isLoading: boolean }) {
  const [open, setOpen] = React.useState(false);

  // Nothing to delete by hand: the demo and its sample data go when it ends.
  if (user?.isDemo) {
    return (
      <Card className="mt-6 border-0 p-6 shadow-sm">
        <h2 className="text-sm font-semibold">Delete account</h2>
        <p className="mt-2 text-xs text-muted-foreground">
          This demo and everything in it are deleted automatically when it ends.
        </p>
      </Card>
    );
  }

  return (
    <Card className="mt-6 border border-destructive/30 p-6 shadow-sm">
      <div className="text-xs text-muted-foreground">
        <h2 className="text-sm font-semibold text-destructive">Delete account</h2>
        <p className="mb-2">Permanently deletes your account and everything in it:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>your accounts and their balances;</li>
          <li>every transaction, including deleted and recurring ones;</li>
          <li>the categories you created, your goals and pending drafts;</li>
          <li>connected AI apps and every signed-in session.</li>
        </ul>
        <p className="mt-2">Export your data first if you want to keep a copy. This can&apos;t be undone.</p>
      </div>
      <div className="flex justify-end">
        {isLoading ? (
          <Skeleton className="h-9 w-36" />
        ) : (
          <Button variant="destructive" onClick={() => setOpen(true)} disabled={!user}>
            Delete account…
          </Button>
        )}
      </div>
      {user && (
        <DeleteAccountDialog
          open={open}
          onOpenChange={setOpen}
          email={user.email}
          // Unknown (an older API) counts as a password account: the backend
          // then answers with a field error if it isn't one.
          hasPassword={user.hasPassword !== false}
        />
      )}
    </Card>
  );
}

function DeleteAccountDialog({
  open,
  onOpenChange,
  email,
  hasPassword,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
  hasPassword: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, setPending] = React.useState(false);
  const form = useForm<DeleteValues>({
    resolver: zodResolver(deleteSchema(hasPassword)),
    defaultValues: { confirmText: "", password: "", confirmEmail: "" },
  });

  function changeOpen(next: boolean) {
    if (pending) return;
    if (!next) form.reset();
    onOpenChange(next);
  }

  async function action() {
    const valid = await form.trigger(undefined, { shouldFocus: true });
    if (!valid) return;
    const { password, confirmEmail } = form.getValues();
    setPending(true);
    try {
      await authApi.delete("/account", hasPassword ? { password } : { confirmEmail });
    } catch (err) {
      setPending(false);
      handleApiError(err, { setError: form.setError, fallback: "Couldn't delete the account. Please try again." });
      // Put the cursor on the field the server refused (e.g. a wrong password).
      const refused = (["password", "confirmEmail"] as const).find((name) => form.getFieldState(name).error);
      if (refused) form.setFocus(refused);
      return;
    }
    // The session is gone with the account: drop everything cached for it.
    queryClient.clear();
    router.replace("/login?reason=account_deleted");
    router.refresh();
  }

  return (
    <AlertDialog open={open} onOpenChange={changeOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your account?</AlertDialogTitle>
          <AlertDialogDescription>
            Your account and all of its data will be deleted for good, and you&apos;ll be signed out everywhere.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Form {...form}>
          <form action={action} className="grid gap-4" aria-label="Delete account">
            {/* Tells password managers which account the password belongs to. */}
            <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />
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
            {hasPassword ? (
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <PasswordInput autoComplete="current-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <FormField
                control={form.control}
                name="confirmEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Your email</FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="off" spellCheck={false} {...field} />
                    </FormControl>
                    <FormDescription>You sign in with Google, so type {email} instead of a password.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
              <SubmitButton
                pendingText="Deleting…"
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete account
              </SubmitButton>
            </AlertDialogFooter>
          </form>
        </Form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
