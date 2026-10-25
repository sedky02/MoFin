"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
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
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PasswordInput } from "@/components/common/password-input";
import { SubmitButton } from "@/components/common/submit-button";
import { authApi } from "@/lib/api";
import { handleApiError } from "@/lib/form-errors";
import type { User } from "@/lib/types";

// Same rule as register and reset (the backend checks it too).
const changeSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z.string().min(8, "Use at least 8 characters."),
    confirmPassword: z.string().min(1, "Repeat the new password."),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "The passwords don't match.",
  });
type ChangeValues = z.infer<typeof changeSchema>;

export function SecurityCard({ user, isLoading }: { user?: User; isLoading: boolean }) {
  return (
    <Card className="mt-6 border-0 p-6 shadow-sm">
      <h2 className="text-sm font-semibold">Security</h2>
      {isLoading ? (
        <Skeleton className="mt-4 h-40 w-full" />
      ) : user?.hasPassword === false ? (
        <p className="mb-5 text-xs text-muted-foreground">
          You sign in with Google, so there&apos;s no MoFin password to change. Your Google account&apos;s own
          security settings protect this sign-in.
        </p>
      ) : (
        <>
          <p className="mb-5 text-xs text-muted-foreground">
            Changing your password signs out every other device. This one stays signed in.
          </p>
          <ChangePasswordForm email={user?.email ?? ""} />
        </>
      )}
      <Separator className="my-6" />
      <SignOutEverywhere />
    </Card>
  );
}

function ChangePasswordForm({ email }: { email: string }) {
  const form = useForm<ChangeValues>({
    resolver: zodResolver(changeSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  async function action() {
    const valid = await form.trigger(undefined, { shouldFocus: true });
    if (!valid) return;
    const { currentPassword, newPassword } = form.getValues();
    try {
      await authApi.post("/password/change", { currentPassword, newPassword });
      form.reset();
      toast.success("Password changed. Other devices were signed out.");
    } catch (err) {
      handleApiError(err, { setError: form.setError, fallback: "Could not change the password." });
      // Put the cursor on the field the server refused (e.g. a wrong current password).
      const refused = (["currentPassword", "newPassword"] as const).find((name) => form.getFieldState(name).error);
      if (refused) form.setFocus(refused);
    }
  }

  return (
    <Form {...form}>
      <form action={action} className="space-y-5" aria-label="Change password">
        {/* Tells password managers which account the new password belongs to. */}
        <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />
        <FormField
          control={form.control}
          name="currentPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Current password</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="newPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New password</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="new-password" placeholder="At least 8 characters" {...field} />
              </FormControl>
              <FormDescription>Use at least 8 characters.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Repeat new password</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end">
          <SubmitButton pendingText="Changing…">Change password</SubmitButton>
        </div>
      </form>
    </Form>
  );
}

function SignOutEverywhere() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  async function signOutEverywhere() {
    setConfirming(false);
    setPending(true);
    try {
      await authApi.post("/sessions/revoke-all");
    } catch (err) {
      handleApiError(err, { fallback: "Couldn't sign out everywhere. Please try again." });
      setPending(false);
      return;
    }
    queryClient.clear();
    router.replace("/login?reason=signed_out");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 className="text-sm font-medium">Sign out everywhere</h3>
        <p className="text-xs text-muted-foreground">
          Signs out every device and browser, this one included.
        </p>
      </div>
      <Button
        variant="outline"
        className="shrink-0"
        onClick={() => setConfirming(true)}
        disabled={pending}
        aria-busy={pending}
      >
        {pending && <Loader2 className="size-4 animate-spin" />}
        {pending ? "Signing out…" : "Sign out everywhere"}
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Sign out everywhere?"
        description="Every device and browser signed in to your account will be signed out, including this one. You'll need to sign in again."
        confirmLabel="Sign out everywhere"
        destructive
        onConfirm={signOutEverywhere}
      />
    </div>
  );
}
