"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertCircle, ArrowRight, Check, Clock } from "lucide-react";
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
import {
  AUTH_BUTTON,
  AUTH_INPUT,
  AUTH_LABEL,
  AUTH_LINK,
  AuthChip,
  AuthChips,
  AuthHeading,
  AuthSwitch,
} from "@/components/auth/auth-parts";
import { AuthMailScene } from "@/components/auth/auth-scenes";
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
      <div className="text-center">
        <AuthMailScene className="mb-7" />
        <AuthHeading
          align="center"
          headingRef={confirmationRef}
          title="Check your"
          accent="email"
          subtitle={
            <span role="status">
              If an account exists for <span className="font-semibold text-foreground">{sentTo}</span>, we have
              sent it a link to reset the password.
            </span>
          }
        />
        <AuthChips>
          <AuthChip icon={Clock}>Expires in 30 minutes</AuthChip>
          <AuthChip icon={Check}>Works once</AuthChip>
        </AuthChips>
        <p className="mt-8 text-[15px] leading-relaxed text-muted-foreground">
          Nothing arrived? Check your spam folder, or try again in a few minutes.
        </p>
        <div className="mt-11 flex flex-col gap-3.5">
          <Button asChild className={AUTH_BUTTON}>
            <Link href="/login">
              Back to sign in
              <ArrowRight className="size-[18px]" aria-hidden />
            </Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-full text-[15px] font-semibold text-muted-foreground"
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
      <AuthHeading
        eyebrow="Reset password"
        title="Forgot your"
        accent="password?"
        subtitle="Enter the email you sign in with and we'll send you a link to choose a new one."
      />

      {rateLimited && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>Too many attempts. Please wait a few minutes and try again.</span>
        </div>
      )}

      <Form {...form}>
        <form action={action} className="space-y-6">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem className="gap-2.5">
                <FormLabel className={AUTH_LABEL}>Email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    className={AUTH_INPUT}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <SubmitButton className={AUTH_BUTTON} pendingText="Sending link…">
            Send reset link
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
