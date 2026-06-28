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
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/common/submit-button";
import { ApiClientError } from "@/lib/api";
import { handleApiError } from "@/lib/form-errors";
import { cn } from "@/lib/utils";

const registerSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters."),
  displayName: z.string().trim().max(80).optional(),
});
type RegisterValues = z.infer<typeof registerSchema>;

function scorePassword(pw: string): number {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 4);
}

const STRENGTH = [
  { label: "Too short", cls: "bg-destructive" },
  { label: "Weak", cls: "bg-destructive" },
  { label: "Fair", cls: "bg-warning" },
  { label: "Good", cls: "bg-primary" },
  { label: "Strong", cls: "bg-success" },
];

export default function RegisterPage() {
  const router = useRouter();
  const [rateLimited, setRateLimited] = React.useState(false);

  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "", displayName: "" },
    mode: "onChange",
  });

  const password = form.watch("password");
  const strength = scorePassword(password ?? "");

  async function action() {
    setRateLimited(false);
    const valid = await form.trigger();
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
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      handleApiError(err, {
        setError: form.setError,
        fallback: "Registration failed.",
      });
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="font-heading text-3xl font-bold leading-tight tracking-tight">
          Request
          <br />
          <span className="text-primary terminal-glow">Node Access</span>
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Provision a new terminal and track your money with precision.
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
            name="displayName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Display name{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </FormLabel>
                <FormControl>
                  <Input autoComplete="name" placeholder="Alex Rivera" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
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
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    {...field}
                  />
                </FormControl>
                {/* Strength indicator */}
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex h-1.5 flex-1 gap-1">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={cn(
                          "h-full flex-1 rounded-full transition-colors",
                          i < strength
                            ? STRENGTH[strength].cls
                            : "bg-border",
                        )}
                      />
                    ))}
                  </div>
                  <span className="w-14 text-right text-xs text-muted-foreground">
                    {password ? STRENGTH[strength].label : ""}
                  </span>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
          <SubmitButton
            className="h-11 w-full font-mono text-sm font-bold uppercase tracking-widest"
            pendingText="Provisioning…"
          >
            Provision Node
          </SubmitButton>
          <FormDescription className="text-center text-xs">
            By continuing you agree to keep your finances honest. 🙂
          </FormDescription>
        </form>
      </Form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
