"use client";

import * as React from "react";
import Link from "next/link";
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
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/common/submit-button";
import {
  AUTH_BUTTON,
  AUTH_INPUT,
  AUTH_LABEL,
  AUTH_LINK,
  AuthHeading,
  AuthSwitch,
} from "@/components/auth/auth-parts";
import { AuthMailScene } from "@/components/auth/auth-scenes";
import { InboxButton, ResendButton, SentAddressCard, useCooldown } from "@/components/auth/email-sent";
import { ApiClientError } from "@/lib/api";
import { handleApiError } from "@/lib/form-errors";

const forgotSchema = z.object({
  email: z.string().email("Enter a valid email address."),
});
type ForgotValues = z.infer<typeof forgotSchema>;

export default function ForgotPasswordPage() {
  const [rateLimited, setRateLimited] = React.useState(false);
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const [resend, setResend] = React.useState<"idle" | "sending" | "sent" | "limited" | "failed">("idle");
  const cooldown = useCooldown(0);
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
      cooldown.restart();
    } catch (err) {
      handleApiError(err, { setError: form.setError, fallback: "Could not send the reset link." });
    }
  }

  async function sendAgain() {
    if (!sentTo) return;
    setResend("sending");
    const res = await fetch("/api/auth/password/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: sentTo }),
    }).catch(() => null);
    if (res?.status === 429) return setResend("limited");
    if (!res?.ok) return setResend("failed");
    setResend("sent");
    cooldown.restart();
  }

  if (sentTo) {
    return (
      <div className="text-center">
        <AuthMailScene className="mb-6" />
        <AuthHeading
          align="center"
          compact
          headingRef={confirmationRef}
          title="Check your"
          accent="email"
          subtitle={<span role="status">If an account exists for this email, we sent it a reset link:</span>}
        />

        <SentAddressCard
          email={sentTo}
          meta="Expires in 30 minutes · works once"
          action={
            <button
              type="button"
              className={AUTH_LINK}
              onClick={() => {
                setSentTo(null);
                setResend("idle");
                form.reset({ email: sentTo });
              }}
            >
              Change
            </button>
          }
        />

        <div className="mt-8 flex flex-col gap-3">
          <InboxButton email={sentTo} />
          <ResendButton
            email={sentTo}
            label="Send again"
            sending={resend === "sending"}
            cooldown={cooldown.seconds}
            onResend={sendAgain}
          />
        </div>

        <p role="status" className="mt-3 min-h-5 text-sm">
          {resend === "sent" && <span className="text-success">We sent a new link. It replaces the old one.</span>}
          {resend === "limited" && (
            <span className="text-destructive">Too many attempts. Try again in a few minutes.</span>
          )}
          {resend === "failed" && <span className="text-destructive">Couldn&apos;t send it. Try again.</span>}
        </p>

        <p className="mx-auto mt-4 max-w-[400px] text-[13px] leading-relaxed text-muted-foreground">
          Open the link to choose a new password, then sign in with it. Can&apos;t find the email? Check your spam
          folder.
        </p>

        <AuthSwitch className="mt-7">
          Remembered it?{" "}
          <Link href="/login" className={AUTH_LINK}>
            Sign in
          </Link>
        </AuthSwitch>
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
