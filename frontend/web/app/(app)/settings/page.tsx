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
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/common/page-header";
import { SubmitButton } from "@/components/common/submit-button";
import { SettingsCard } from "@/components/settings/settings-card";
import { SettingsNav } from "@/components/settings/settings-nav";
import { ThemeSetting } from "@/components/settings/theme-setting";
import { ConnectedAppsCard } from "@/components/settings/connected-apps-card";
import { DataCard } from "@/components/settings/data-card";
import { DeleteAccountCard } from "@/components/settings/delete-account-card";
import { useUser, useUpdateUser } from "@/hooks/useUser";
import { useAccounts } from "@/hooks/useAccounts";
import { Button } from "@/components/ui/button";
import { handleApiError } from "@/lib/form-errors";
import { SecurityCard } from "@/components/settings/security-card";

const schema = z.object({
  displayName: z.string().trim().max(80, "Keep it under 80 characters.").optional(),
  // "auto" = no explicit preference (most common balance currency is used).
  defaultCurrency: z.string(),
  // "none" = no main account (summary covers all accounts).
  mainAccountId: z.string(),
});
type Values = z.infer<typeof schema>;

export default function SettingsPage() {
  const { data: user, isLoading } = useUser();
  const updateMut = useUpdateUser();
  const { data: accounts } = useAccounts();

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { displayName: "", defaultCurrency: "auto", mainAccountId: "none" },
  });

  // A saved id whose account was archived/deleted reads as "none" so Save isn't offered for a no-op.
  const savedMainId = accounts?.some((a) => a.id === user?.settings?.mainAccountId)
    ? (user?.settings?.mainAccountId as string)
    : "none";

  React.useEffect(() => {
    if (user)
      form.reset({
        displayName: user.displayName ?? "",
        defaultCurrency: user.settings?.defaultCurrency || "auto",
        mainAccountId: savedMainId,
      });
  }, [user, form, savedMainId]);

  const currentName = form.watch("displayName") ?? "";
  const currentCurrency = form.watch("defaultCurrency");
  const currentMain = form.watch("mainAccountId");
  const changed =
    (user?.displayName ?? "") !== currentName.trim() ||
    (user?.settings?.defaultCurrency || "auto") !== currentCurrency ||
    savedMainId !== currentMain;

  async function action() {
    const valid = await form.trigger(undefined, { shouldFocus: true });
    if (!valid) return;
    try {
      // The API replaces `settings` wholesale, so merge into the existing object.
      const { defaultCurrency: _old, mainAccountId: _oldMain, ...otherSettings } = user?.settings ?? {};
      void _old;
      void _oldMain;
      await updateMut.mutateAsync({
        displayName: currentName.trim(),
        settings: {
          ...otherSettings,
          ...(currentCurrency !== "auto" ? { defaultCurrency: currentCurrency } : {}),
          ...(currentMain !== "none" ? { mainAccountId: currentMain } : {}),
        },
      });
    } catch (err) {
      handleApiError(err, { setError: form.setError });
    }
  }

  function discard() {
    form.reset({
      displayName: user?.displayName ?? "",
      defaultCurrency: user?.settings?.defaultCurrency || "auto",
      mainAccountId: savedMainId,
    });
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Settings" description="Manage your profile, preferences and security." />

      <div className="lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-10">
        <SettingsNav />

        <div className="min-w-0 max-w-2xl space-y-6">
          {isLoading ? (
            <>
              <SettingsCard id="profile" title="Profile" description="Your sign-in email. Changing it isn't supported yet.">
                <div className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              </SettingsCard>
              <SettingsCard id="preferences" title="Preferences">
                <Skeleton className="h-24 w-full" />
              </SettingsCard>
            </>
          ) : (
            <Form {...form}>
              <form action={action} className="space-y-6">
                <SettingsCard id="profile" title="Profile" description="Your sign-in email. Changing it isn't supported yet.">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="settings-email">Email</Label>
                      <Input
                        id="settings-email"
                        // A demo's address is a generated placeholder; say what it is instead.
                        value={user?.isDemo ? "Temporary demo account" : (user?.email ?? "")}
                        readOnly
                        disabled
                        className="bg-muted/50"
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="displayName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Display name</FormLabel>
                          <FormControl>
                            <Input placeholder="Your name" autoComplete="name" {...field} />
                          </FormControl>
                          <FormDescription>Shown across the app.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </SettingsCard>

                <SettingsCard
                  id="preferences"
                  title="Preferences"
                  description="How your money is shown and where new entries start."
                >
                  <div className="grid gap-5 sm:grid-cols-2">
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

                    <FormField
                      control={form.control}
                      name="mainAccountId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Default account</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">None (all accounts)</SelectItem>
                              {(accounts ?? []).map((a) => (
                                <SelectItem key={a.id} value={a.id}>
                                  {a.name} <span className="text-xs text-muted-foreground tabular">{a.currency}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            The dashboard and new transactions start here. Pick another from the account menu at the top
                            any time.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="mt-6 border-t border-border pt-5">
                    <ThemeSetting />
                  </div>
                </SettingsCard>

                {changed && (
                  <div
                    role="status"
                    className="sticky bottom-20 z-20 flex items-center justify-between gap-3 rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur-md lg:bottom-4"
                  >
                    <p className="text-sm">You have unsaved changes.</p>
                    <div className="flex shrink-0 gap-2">
                      <Button type="button" variant="ghost" onClick={discard}>
                        Discard
                      </Button>
                      <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
                    </div>
                  </div>
                )}
              </form>
            </Form>
          )}

          <SecurityCard user={user} isLoading={isLoading} />

          <ConnectedAppsCard />

          <DataCard />

          <DeleteAccountCard user={user} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
}
