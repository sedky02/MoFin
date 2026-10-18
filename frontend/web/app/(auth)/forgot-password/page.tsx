"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertCircle, MailCheck } from "lucide-react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/common/submit-button";
import { ApiClientError } from "@/lib/api";
import { handleApiError } from "@/lib/form-errors";

const forgotSchema = z.object({
  email: z.string().email("Enter a valid email address."),
});
type ForgotValues = z.infer<typeof forgotSchema>;

export default function ForgotPasswordPage() {
  const [rateLimited, setRateLimited] = React.useState(false);
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const confirmationRef = React.useRef<HTMLHeadingElement>(null);

  const form = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: "" },
  });

  // Move focus to the confirmation so screen reader and keyboard users land
  // on the new content instead of on a button that no longer exists.
  React.useEffect(() => {
    if (sentTo) confirmationRef.current?.focus();
  }, [sentTo]);

  async function action() {
    setRateLimited(false);
    const valid = await form.trigger(undefined, { shouldFocus: true });
    if (!valid) return;
    const { email } = form.getValues();

    try {
      const res = await fetch("/api/auth/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 429) {
          setRateLimited(true);
          return;
        }
        throw new ApiClientError(res.status, body.message ?? "Could not send the reset link.", body);
      }
      // Same confirmation whether or not the email has an account: the
      // backend doesn't say, and neither should the page.
      setSentTo(email.trim());
    } catch (err) {
      handleApiError(err, { setError: form.setError, fallback: "Could not send the reset link." });
    }
  }

  if (sentTo) {
    return (
      <div>
        <div className="mb-6">
          <MailCheck className="mb-4 size-8 text-primary-text" aria-hidden />
          <h1
            ref={confirmationRef}
            tabIndex={-1}
            className="font-heading text-3xl font-bold leading-tight tracking-tight outline-none"
          >
            Check your email
          </h1>
          <p role="status" className="mt-3 text-sm leading-relaxed text-muted-foreground">
            If an account exists for <span className="font-medium text-foreground">{sentTo}</span>,
            we have sent it a link to reset the password. The link works once and expires in
            30 minutes.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Nothing arrived? Check your spam folder, or try again in a few minutes.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Button asChild className="h-11 w-full text-sm font-semibold">
            <Link href="/login">Back to sign in</Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-full text-sm"
            onClick={() => {
              setSentTo(null);
              form.reset({ email: "" });
            }}
          >
            Use a different email
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold leading-tight tracking-tight">
          Forgot your
          <br />
          <span className="text-primary-text">password?</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter the email you sign in with and we&apos;ll send you a link to choose a new one.
        </p>
      </div>

      {rateLimited && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>Too many attempts. Please wait a few minutes and try again.</span>
        </div>
      )}

      <Form {...form}>
        <form action={action} className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <SubmitButton
            className="h-11 w-full text-sm font-semibold"
            pendingText="Sending link…"
          >
            Send reset link
          </SubmitButton>
        </form>
      </Form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Remembered it?{" "}
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
