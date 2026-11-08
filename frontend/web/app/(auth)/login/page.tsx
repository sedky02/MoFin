"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertCircle, ArrowRight, CheckCircle2, Info } from "lucide-react";
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
import { ApiClientError } from "@/lib/api";
import { handleApiError } from "@/lib/form-errors";
import { safeNextPath } from "@/lib/safe-next";
import { checkEmailUrl } from "@/lib/pending-signup";
import { loginNotice } from "@/lib/auth-feedback";
import { DemoButton } from "@/components/landing/demo-button";
import {
  AUTH_BUTTON,
  AUTH_INPUT,
  AUTH_LABEL,
  AUTH_LINK,
  AuthDivider,
  AuthHeading,
  AuthSwitch,
} from "@/components/auth/auth-parts";
import { cn } from "@/lib/utils";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});
type LoginValues = z.infer<typeof loginSchema>;

function noopSubscribe() {
  return () => {};
}

export default function LoginPage() {
  const router = useRouter();
  const [rateLimited, setRateLimited] = React.useState(false);
  // This page is statically prerendered, so the query string only exists
  // client-side: "" on the server and during hydration, the real one after.
  const search = React.useSyncExternalStore(
    noopSubscribe,
    () => window.location.search,
    () => "",
  );
  const params = new URLSearchParams(search);
  const justReset = params.get("reset") === "1";
  const notice = loginNotice(params);

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  // Carried over from /register (the password never is). Only fills an empty field.
  const prefillEmail = params.get("email");
  React.useEffect(() => {
    if (prefillEmail && !form.getValues("email")) form.setValue("email", prefillEmail);
  }, [prefillEmail, form]);

  // Submitted via <form action> so useFormStatus drives the button's pending state.
  async function action() {
    setRateLimited(false);
    const valid = await form.trigger(undefined, { shouldFocus: true });
    if (!valid) return;
    const values = form.getValues();

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 429) {
          setRateLimited(true);
          return;
        }
        throw new ApiClientError(res.status, body.message ?? "Login failed.", body);
      }
      // An MCP OAuth login resumes the cross-origin bridge (a full navigation: the handoff route
      // 302s across origins) instead of going to the dashboard.
      const mcpAuthorize = new URLSearchParams(window.location.search).get("mcp_authorize");
      if (mcpAuthorize) {
        window.location.href = `/api/auth/mcp-handoff?continue=${encodeURIComponent(mcpAuthorize)}`;
        return;
      }
      router.replace(safeNextPath(new URLSearchParams(window.location.search).get("next")));
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 403 && err.body && "code" in err.body && err.body.code === "EMAIL_NOT_VERIFIED") {
        router.replace(checkEmailUrl(values.email, "signin", new URLSearchParams(window.location.search)));
        return;
      }
      if (err instanceof ApiClientError && err.status === 401) {
        form.setError("password", {
          type: "server",
          message: "Incorrect email or password.",
        });
        return;
      }
      handleApiError(err, { setError: form.setError, fallback: "Login failed." });
    }
  }

  return (
    <div>
      <AuthHeading eyebrow="Sign in" title="Sign in to" accent="MoFin" subtitle="Pick up where you left off." />

      {justReset && !rateLimited && (
        <div
          role="status"
          className="mb-6 flex items-start gap-2.5 rounded-xl border border-success/30 bg-success/10 px-3.5 py-3 text-sm text-success"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <span>Your password has been reset. Sign in with your new password.</span>
        </div>
      )}

      {notice && !rateLimited && (
        <div
          role="alert"
          className={
            notice.kind === "error"
              ? "mb-6 flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
              : "mb-6 flex items-start gap-2.5 rounded-xl border border-border bg-muted px-3.5 py-3 text-sm text-foreground"
          }
        >
          {notice.kind === "error" ? (
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
          ) : (
            <Info className="mt-0.5 size-4 shrink-0" />
          )}
          <span>{notice.message}</span>
        </div>
      )}

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
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem className="gap-2.5">
                <FormLabel className={cn(AUTH_LABEL, "col-start-1 row-start-1")}>Password</FormLabel>
                <FormControl>
                  <PasswordInput
                    autoComplete="current-password"
                    placeholder="Your password"
                    className={AUTH_INPUT}
                    {...field}
                  />
                </FormControl>
                {/* Last in the DOM so tabbing goes email, password, then this; drawn on the label's row. */}
                <Link
                  href="/forgot-password"
                  className={cn(AUTH_LINK, "col-start-1 row-start-1 justify-self-end text-[13px]")}
                >
                  Forgot password?
                </Link>
                <FormMessage />
              </FormItem>
            )}
          />
          <SubmitButton className={AUTH_BUTTON} pendingText="Signing in…">
            Sign in
            <ArrowRight className="size-[18px]" aria-hidden />
          </SubmitButton>
        </form>
      </Form>

      <AuthSwitch className="mt-5">
        New to MoFin?{" "}
        <Link href="/register" className={AUTH_LINK}>
          Create an account
        </Link>
      </AuthSwitch>

      <AuthDivider />
      <div className="space-y-3.5">
        <GoogleButton />
        <DemoButton size="quiet" />
      </div>
    </div>
  );
}
