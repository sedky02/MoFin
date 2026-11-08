"use client";

import { FormLabelWithHint } from "@/components/common/form-label-hint";
import * as React from "react";
import { SlidersHorizontal, User as UserIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
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
import { SaveBar } from "@/components/settings/save-bar";
import { ThemeSetting } from "@/components/settings/theme-setting";
import { ConnectedAppsCard } from "@/components/settings/connected-apps-card";
import { AiProviderCard } from "@/components/settings/ai-provider-card";
import { DataCard } from "@/components/settings/data-card";
import { MobileAppCard } from "@/components/settings/mobile-app-card";
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

  // A link like /settings#connected-apps lands before the profile has loaded, and the
  // cards above its target change height when it does; go to the section again once settled.
  React.useEffect(() => {
    if (isLoading) return;
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView();
  }, [isLoading]);

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
              <SettingsCard id="profile" icon={UserIcon} title="Profile" description="Your sign-in email. Changing it isn't supported yet.">
                <div className="mb-5 flex items-center gap-4 rounded-xl bg-muted/40 p-4">
                  <Skeleton className="size-14 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3.5 w-44" />
                  </div>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  {[0, 1].map((i) => (
                    <div key={i} className="space-y-2">
                      <Skeleton className="h-3.5 w-24" />
                      <Skeleton className="h-9 w-full rounded-lg" />
                    </div>
                  ))}
                </div>
              </SettingsCard>
              <SettingsCard id="preferences" icon={SlidersHorizontal} title="Preferences" description="How your money is shown and where new entries start.">
                <div className="grid gap-5 sm:grid-cols-2">
                  {[0, 1].map((i) => (
                    <div key={i} className="space-y-2">
                      <Skeleton className="h-3.5 w-28" />
                      <Skeleton className="h-9 w-full rounded-lg" />
                    </div>
                  ))}
                </div>
                <div className="mt-6 border-t border-border pt-5">
                  <Skeleton className="h-3.5 w-24" />
                  <div className="mt-3 grid max-w-sm grid-cols-2 gap-3">
                    <Skeleton className="h-24 rounded-xl" />
                    <Skeleton className="h-24 rounded-xl" />
                  </div>
                </div>
              </SettingsCard>
            </>
          ) : (
            <Form {...form}>
              <form action={action} className="space-y-6">
                <SettingsCard id="profile" icon={UserIcon} title="Profile" description="Your sign-in email. Changing it isn't supported yet.">
                  <div className="mb-5 flex items-center gap-4 rounded-xl bg-muted/40 p-4">
                    <span
                      aria-hidden
                      className="grid size-14 shrink-0 place-items-center rounded-full bg-primary/15 text-xl font-semibold text-primary-text"
                    >
                      {(currentName.trim() || user?.email || "?").charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{currentName.trim() || "No display name yet"}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {user?.isDemo ? "Temporary demo account" : user?.email}
                      </p>
                    </div>
                  </div>
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
                          <FormLabelWithHint hintLabel="About the display name" hint="Shown across the app.">
                            Display name
                          </FormLabelWithHint>
                          <FormControl>
                            <Input placeholder="Your name" autoComplete="name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </SettingsCard>

                <SettingsCard
                  id="preferences"
                  icon={SlidersHorizontal}
                  title="Preferences"
                  description="How your money is shown and where new entries start."
                >
                  <div className="grid gap-5 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="defaultCurrency"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabelWithHint
                            hintLabel="About the primary currency"
                            hint="Leads the dashboard balance and monthly summary when you have accounts in several currencies."
                          >
                            Primary currency
                          </FormLabelWithHint>
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
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="mainAccountId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabelWithHint
                            hintLabel="About the default account"
                            hint="The dashboard and new transactions start here. Pick another from the account menu at the top any time."
                          >
                            Default account
                          </FormLabelWithHint>
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
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="mt-6 border-t border-border pt-5">
                    <ThemeSetting />
                  </div>
                </SettingsCard>

                {changed && <SaveBar onDiscard={discard} />}
              </form>
            </Form>
          )}

          <SecurityCard user={user} isLoading={isLoading} />

          <ConnectedAppsCard />

          <AiProviderCard user={user} isLoading={isLoading} />

          <MobileAppCard />

          <DataCard user={user} isLoading={isLoading} />

          <DeleteAccountCard user={user} isLoading={isLoading} />

          {/* Room for the fixed save bar, so it never covers the last card. */}
          {changed && <div aria-hidden className="h-16" />}
        </div>
      </div>
    </div>
  );
}
