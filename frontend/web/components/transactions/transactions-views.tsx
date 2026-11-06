"use client";

import * as React from "react";
import { Activity } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SearchView, type SearchInitial } from "@/components/search/search-view";
import { PageHeader } from "@/components/common/page-header";
import { RecurringSeriesList, useRecurringSeriesCount } from "@/components/transactions/recurring-series-list";
import {
  TRANSACTIONS_DESCRIPTION,
  TRANSACTIONS_TITLE,
  parseView,
  recurringViewHref,
  type TransactionsView,
} from "@/lib/transaction-list-params";

/**
 * The /transactions page's two views: every transaction (searchable), and
 * the recurring series (?view=recurring). The list stays mounted while hidden
 * so its filters survive a trip to the Recurring view; its URL sync pauses
 * (<Activity>) and writes its filters back on return.
 */
export function TransactionsViews({
  initialView,
  initial,
}: {
  initialView: TransactionsView;
  initial: SearchInitial;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [view, setView] = React.useState(initialView);
  const seriesCount = useRecurringSeriesCount();

  function changeView(next: string) {
    const value = parseView(next);
    setView(value);
  }

  // The Recurring view owns the URL while it's shown; the list writes its own
  // filters back when it becomes visible again. Runs after the list's effect.
  React.useEffect(() => {
    if (view === "recurring") router.replace(recurringViewHref(pathname), { scroll: false });
  }, [view, pathname, router]);

  return (
    <Tabs value={view} onValueChange={changeView} className="gap-5">
      <PageHeader
        title={TRANSACTIONS_TITLE}
        description={TRANSACTIONS_DESCRIPTION}
        className="mb-3"
        // A small toggle beside the title, not a bar across the page.
        action={
          <div className="flex flex-wrap items-center gap-2">
            <TabsList className="group-data-horizontal/tabs:h-10">
              <TabsTrigger value="all" className="px-5">All</TabsTrigger>
              <TabsTrigger value="recurring" className="gap-2 px-5">
                Recurring
                {!!seriesCount && <span className="tabular text-xs text-muted-foreground">{seriesCount}</span>}
              </TabsTrigger>
            </TabsList>
            {/* The page's own way in to recording one; web has no floating button. */}
            <Button asChild className="h-10 gap-1.5">
              <Link href="/transactions/new">
                <Plus className="size-4" aria-hidden />
                Add transaction
              </Link>
            </Button>
          </div>
        }
      />

      <TabsContent value="all" forceMount className="text-base data-[state=inactive]:hidden">
        <Activity mode={view === "all" ? "visible" : "hidden"}>
          <SearchView initial={initial} active={view === "all"} />
        </Activity>
      </TabsContent>
      <TabsContent value="recurring" className="text-base">
        <RecurringSeriesList />
      </TabsContent>
    </Tabs>
  );
}
