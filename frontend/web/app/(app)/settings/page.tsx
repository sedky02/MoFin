"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/common/page-header";
import { SubmitButton } from "@/components/common/submit-button";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { useUser, useUpdateUser } from "@/hooks/useUser";
import { handleApiError } from "@/lib/form-errors";

const schema = z.object({
  displayName: z.string().trim().max(80, "Keep it under 80 characters.").optional(),
});
type Values = z.infer<typeof schema>;

export default function SettingsPage() {
  const { data: user, isLoading } = useUser();
  const updateMut = useUpdateUser();

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { displayName: "" },
  });

  React.useEffect(() => {
    if (user) form.reset({ displayName: user.displayName ?? "" });
  }, [user, form]);

  const currentName = form.watch("displayName") ?? "";
  const changed = (user?.displayName ?? "") !== currentName.trim();

  async function action() {
    const valid = await form.trigger();
    if (!valid) return;
    try {
      await updateMut.mutateAsync({ displayName: currentName.trim() });
    } catch (err) {
      handleApiError(err, { setError: form.setError });
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Settings" description="Manage your profile and preferences." />

      <Card className="border-0 p-6 shadow-sm">
        <h2 className="text-sm font-semibold">Profile</h2>
        <p className="mb-5 text-xs text-muted-foreground">
          Your email is used to sign in and can&apos;t be changed here.
        </p>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <Form {...form}>
            <form action={action} className="space-y-5">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={user?.email ?? ""} readOnly disabled className="bg-muted/50" />
              </div>

              <FormField
                control={form.control}
                name="displayName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display name</FormLabel>
                    <FormControl>
                      <Input placeholder="Your name" {...field} />
                    </FormControl>
                    <FormDescription>Shown across the app.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end">
                <SubmitButton disabled={!changed} pendingText="Saving…">
                  Save changes
                </SubmitButton>
              </div>
            </form>
          </Form>
        )}
      </Card>

      <Card className="mt-6 flex items-center justify-between border-0 p-6 shadow-sm">
        <div>
          <h2 className="text-sm font-semibold">Appearance</h2>
          <p className="text-xs text-muted-foreground">Switch between light and dark mode.</p>
        </div>
        <ThemeToggle />
      </Card>
    </div>
  );
}
