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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CURRENCIES } from "@/lib/constants";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/common/page-header";
import { SubmitButton } from "@/components/common/submit-button";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { useUser, useUpdateUser } from "@/hooks/useUser";
import { useConnectedApps, useDisconnectApp } from "@/hooks/useConnectedApps";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import type { ConnectedApp } from "@/lib/types";
import { handleApiError } from "@/lib/form-errors";

const schema = z.object({
  displayName: z.string().trim().max(80, "Keep it under 80 characters.").optional(),
  // "auto" = no explicit preference (most common balance currency is used).
  defaultCurrency: z.string(),
});
type Values = z.infer<typeof schema>;

export default function SettingsPage() {
  const { data: user, isLoading } = useUser();
  const updateMut = useUpdateUser();
  const apps = useConnectedApps();
  const disconnect = useDisconnectApp();
  const [toDisconnect, setToDisconnect] = React.useState<ConnectedApp | undefined>();

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { displayName: "", defaultCurrency: "auto" },
  });

  React.useEffect(() => {
    if (user) form.reset({ displayName: user.displayName ?? "", defaultCurrency: user.settings?.defaultCurrency || "auto" });
  }, [user, form]);

  const currentName = form.watch("displayName") ?? "";
  const currentCurrency = form.watch("defaultCurrency");
  const changed =
    (user?.displayName ?? "") !== currentName.trim() ||
    (user?.settings?.defaultCurrency || "auto") !== currentCurrency;

  async function action() {
    const valid = await form.trigger(undefined, { shouldFocus: true });
    if (!valid) return;
    try {
      // The API replaces `settings` wholesale, so merge into the existing object.
      const { defaultCurrency: _old, ...otherSettings } = user?.settings ?? {};
      void _old;
      await updateMut.mutateAsync({
        displayName: currentName.trim(),
        settings: {
          ...otherSettings,
          ...(currentCurrency !== "auto" ? { defaultCurrency: currentCurrency } : {}),
        },
      });
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
                <Label htmlFor="settings-email">Email</Label>
                <Input id="settings-email" value={user?.email ?? ""} readOnly disabled className="bg-muted/50" />
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

              <FormField
                control={form.control}
                name="defaultCurrency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Primary currency</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="auto">Automatic (most-used currency)</SelectItem>
                        {CURRENCIES.map((c) => (
                          <SelectItem key={c} value={c} className="tabular">
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Leads the dashboard balance and monthly summary when you have accounts in several currencies.
                    </FormDescription>
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

      <Card className="mt-6 border-0 p-6 shadow-sm">
        <h2 className="text-sm font-semibold">Connected AI apps</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Apps you&apos;ve approved to read your data and suggest transactions. Disconnecting stops an app
          from renewing access; a session it already holds can keep working for up to 15 minutes.
        </p>
        {apps.isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : apps.isError ? (
          <p className="text-sm text-destructive">Couldn&apos;t load connected apps.</p>
        ) : !apps.data?.length ? (
          <p className="text-sm text-muted-foreground">No apps connected.</p>
        ) : (
          <ul className="divide-y divide-border">
            {apps.data.map((app) => (
              <li key={app.clientId} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{app.clientName ?? "Unnamed app"}</p>
                  <p className="text-xs text-muted-foreground">
                    {app.active ? "Active" : "Not currently signed in"} · {app.scope}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setToDisconnect(app)}>
                  Disconnect
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={!!toDisconnect}
        onOpenChange={(o) => !o && setToDisconnect(undefined)}
        title={`Disconnect ${toDisconnect?.clientName ?? "this app"}?`}
        description="It will lose access and have to ask for your approval again to reconnect."
        confirmLabel="Disconnect"
        destructive
        onConfirm={() => {
          if (toDisconnect) disconnect.mutate(toDisconnect.clientId);
          setToDisconnect(undefined);
        }}
      />

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
