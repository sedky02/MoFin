"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertCircle } from "lucide-react";
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
import { PasswordInput } from "@/components/common/password-input";
import { SubmitButton } from "@/components/common/submit-button";
import { ApiClientError } from "@/lib/api";
import { handleApiError } from "@/lib/form-errors";

const resetSchema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters."),
    confirmPassword: z.string().min(1, "Repeat the new password."),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "The passwords don't match.",
  });
type ResetValues = z.infer<typeof resetSchema>;

function subscribeToHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export default function ResetPasswordPage() {
  const router = useRouter();
  // The token is in the `#token=…` fragment (client-side only: null while prerendering);
  // router.replace on success removes it from the back stack.
  const hash = React.useSyncExternalStore(
    subscribeToHash,
    () => window.location.hash,
    () => null,
  );
  const token =
    hash === null ? undefined : new URLSearchParams(hash.replace(/^#/, "")).get("token");
  const [linkRejected, setLinkRejected] = React.useState(false);
  const [rateLimited, setRateLimited] = React.useState(false);

  const form = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  async function action() {
    if (!token) return;
    setRateLimited(false);
    const valid = await form.trigger(undefined, { shouldFocus: true });
    if (!valid) return;
    const { password } = form.getValues();

    try {
      const res = await fetch("/api/auth/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 429) {
          setRateLimited(true);
          return;
        }
        // A 400 without field errors means the token itself was refused
        // (unknown, used or expired); field errors go to the form below.
        if (res.status === 400 && !Array.isArray(body.errors)) {
          setLinkRejected(true);
          return;
        }
        throw new ApiClientError(res.status, body.message ?? "Could not reset the password.", body);
      }
      router.replace("/login?reset=1");
    } catch (err) {
      handleApiError(err, { setError: form.setError, fallback: "Could not reset the password." });
    }
  }

  if (token === undefined) {
    return <div aria-busy="true" className="min-h-64" />;
  }

  if (!token || linkRejected) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="font-heading text-3xl font-bold leading-tight tracking-tight">
            This link can&apos;t be used
          </h1>
          <div
            role="alert"
            className="mt-4 flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>
              {linkRejected
                ? "This reset link is invalid, was already used, or has expired."
                : "This reset link is incomplete. Open the link from the email again, or copy the whole address."}
            </span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Reset links work once and expire after 30 minutes. You can ask for a new one.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Button asChild className="h-11 w-full text-sm font-semibold">
            <Link href="/forgot-password">Request a new link</Link>
          </Button>
          <Button asChild variant="ghost" className="h-11 w-full text-sm">
            <Link href="/login">Back to sign in</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold leading-tight tracking-tight">
          Choose a new
          <br />
          <span className="text-primary-text">password</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You&apos;ll be signed out everywhere and can then sign in with the new password.
        </p>
      </div>

      {rateLimited && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>Too many attempts. Please wait a moment and try again.</span>
        </div>
      )}

      <Form {...form}>
        <form action={action} className="space-y-4">
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New password</FormLabel>
                <FormControl>
                  <PasswordInput
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    {...field}
                  />
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
          <SubmitButton
            className="h-11 w-full text-sm font-semibold"
            pendingText="Saving…"
          >
            Reset password
          </SubmitButton>
        </form>
      </Form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link
          href="/login"
          className="font-medium text-primary-text underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
