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
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/common/password-input";
import { SubmitButton } from "@/components/common/submit-button";
import { GoogleButton } from "@/components/common/google-button";
import {
  AUTH_BUTTON,
  AUTH_INPUT,
  AUTH_LABEL,
  AUTH_LINK,
  AuthDivider,
  AuthHeading,
  AuthSwitch,
  PasswordStrengthMeter,
} from "@/components/auth/auth-parts";
import { ApiClientError } from "@/lib/api";
import { handleApiError } from "@/lib/form-errors";
import { MIN_PASSWORD_LENGTH, scorePassword } from "@/lib/password-strength";

const registerSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(MIN_PASSWORD_LENGTH,"Use at least 8 characters."),
  displayName: z.string().trim().max(80).optional(),
});
type RegisterValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const [rateLimited, setRateLimited] = React.useState(false);

  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "", displayName: "" },
    // Validate on blur, then on every change once a field was touched, so the
    // alert isn't announced while the user is still typing the first time.
    mode: "onTouched",
  });

  const password = form.watch("password");
  const strength = scorePassword(password ?? "");
  const passwordError = form.formState.errors.password;

  async function action() {
    setRateLimited(false);
    const valid = await form.trigger(undefined, { shouldFocus: true });
    if (!valid) return;
    const values = form.getValues();

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: values.email,
          password: values.password,
          ...(values.displayName ? { displayName: values.displayName } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 429) {
          setRateLimited(true);
          return;
        }
        throw new ApiClientError(res.status, body.message ?? "Registration failed.", body);
      }
      // No auto-login (the backend never signals whether the email was new): send the user to log
      // in, keeping the MCP bridge param.
      const params = new URLSearchParams(window.location.search);
      const mcpAuthorize = params.get("mcp_authorize");
      const loginUrl = new URL("/login", window.location.origin);
      loginUrl.searchParams.set("registered", "1");
      loginUrl.searchParams.set("email", values.email);
      if (mcpAuthorize) loginUrl.searchParams.set("mcp_authorize", mcpAuthorize);
      const next = params.get("next");
      if (next) loginUrl.searchParams.set("next", next);
      router.replace(`${loginUrl.pathname}${loginUrl.search}`);
    } catch (err) {
      handleApiError(err, {
        setError: form.setError,
        fallback: "Registration failed.",
      });
    }
  }

  return (
    <div>
      <AuthHeading
        compact
        eyebrow="Create account"
        title="Create your"
        accent="account"
        subtitle="Track your money with precision."
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
        <form action={action} className="space-y-[18px]">
          <FormField
            control={form.control}
            name="displayName"
            render={({ field }) => (
              <FormItem className="gap-2">
                <FormLabel className={AUTH_LABEL}>
                  Display name{" "}
                  <span className="font-normal text-muted-foreground">(optional)</span>
                </FormLabel>
                <FormControl>
                  <Input autoComplete="name" placeholder="Alex Rivera" className={AUTH_INPUT} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem className="gap-2">
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
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem className="gap-2">
                <FormLabel className={AUTH_LABEL}>Password</FormLabel>
                <FormControl>
                  <PasswordInput
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    className={AUTH_INPUT}
                    {...field}
                  />
                </FormControl>
                <PasswordStrengthMeter
                  compact
                  strength={strength}
                  hasValue={Boolean(password)}
                  hint={passwordError ? undefined : "Use at least 8 characters"}
                />
                <FormMessage />
              </FormItem>
            )}
          />
          <SubmitButton className={AUTH_BUTTON} pendingText="Creating account…">
            Create account
            <ArrowRight className="size-[18px]" aria-hidden />
          </SubmitButton>
          <p className="text-center text-[12.5px] text-muted-foreground">
            By continuing you agree to keep your finances honest.
          </p>
        </form>
      </Form>

      <AuthDivider compact />
      <GoogleButton label="Sign up with Google" />

      <AuthSwitch>
        Already have an account?{" "}
        <Link href="/login" className={AUTH_LINK}>
          Sign in
        </Link>
      </AuthSwitch>
    </div>
  );
}
