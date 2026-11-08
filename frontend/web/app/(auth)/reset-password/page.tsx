"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertCircle, ArrowRight } from "lucide-react";
import {
  Form,
  FormControl,
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
import { scorePassword } from "@/lib/password-strength";
import {
  AUTH_BUTTON,
  AUTH_INPUT,
  AUTH_LABEL,
  AUTH_LINK,
  AuthHeading,
  AuthSwitch,
  PasswordStrengthMeter,
} from "@/components/auth/auth-parts";
import { AuthBrokenLinkScene } from "@/components/auth/auth-scenes";

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
  const password = form.watch("password");

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
      <div className="text-center">
        <AuthBrokenLinkScene className="mb-7" />
        <AuthHeading align="center" title="This link can't be" accent="used" />
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-left text-sm leading-relaxed text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>
            {linkRejected
              ? "This reset link is invalid, was already used, or has expired."
              : "This reset link is incomplete. Open the link from the email again, or copy the whole address."}
          </span>
        </div>
        <p className="mt-7 text-[15px] leading-relaxed text-muted-foreground">
          Reset links work once and expire after 30 minutes. You can ask for a new one.
        </p>
        <div className="mt-11 flex flex-col gap-3.5">
          <Button asChild className={AUTH_BUTTON}>
            <Link href="/forgot-password">
              Request a new link
              <ArrowRight className="size-[18px]" aria-hidden />
            </Link>
          </Button>
          <Button asChild variant="ghost" className="h-11 w-full text-[15px] font-semibold text-muted-foreground">
            <Link href="/login">Back to sign in</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <AuthHeading
        eyebrow="Reset password"
        title="Choose a new"
        accent="password"
        subtitle="You'll be signed out everywhere and can then sign in with the new password."
      />

      {rateLimited && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>Too many attempts. Please wait a moment and try again.</span>
        </div>
      )}

      <Form {...form}>
        <form action={action} className="space-y-6">
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem className="gap-2.5">
                <FormLabel className={AUTH_LABEL}>New password</FormLabel>
                <FormControl>
                  <PasswordInput
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    className={AUTH_INPUT}
                    {...field}
                  />
                </FormControl>
                <PasswordStrengthMeter
                  strength={scorePassword(password ?? "")}
                  hasValue={Boolean(password)}
                  hint="Use at least 8 characters"
                />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem className="gap-2.5">
                <FormLabel className={AUTH_LABEL}>Repeat new password</FormLabel>
                <FormControl>
                  <PasswordInput autoComplete="new-password" className={AUTH_INPUT} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <SubmitButton className={AUTH_BUTTON} pendingText="Saving…">
            Reset password
            <ArrowRight className="size-[18px]" aria-hidden />
          </SubmitButton>
        </form>
      </Form>

      <AuthSwitch>
        <Link href="/login" className={AUTH_LINK}>
          Back to sign in
        </Link>
      </AuthSwitch>
    </div>
  );
}
