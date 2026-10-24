"use client";

import * as React from "react";
import { Activity } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SearchView, type SearchInitial } from "@/components/search/search-view";
import { RecurringSeriesList } from "@/components/transactions/recurring-series-list";
import { parseView, type TransactionsView } from "@/lib/transaction-list-params";

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

  function changeView(next: string) {
    const value = parseView(next);
    setView(value);
    if (value === "recurring") router.replace(`${pathname}?view=recurring`, { scroll: false });
  }

  return (
    <Tabs value={view} onValueChange={changeView} className="gap-5">
      <TabsList className="w-full">
        <TabsTrigger value="all" className="flex-1">
          All
        </TabsTrigger>
        <TabsTrigger value="recurring" className="flex-1">
          Recurring
        </TabsTrigger>
      </TabsList>

      <TabsContent value="all" forceMount className="text-base data-[state=inactive]:hidden">
        <Activity mode={view === "all" ? "visible" : "hidden"}>
          <SearchView initial={initial} />
        </Activity>
      </TabsContent>
      <TabsContent value="recurring" className="text-base">
        <RecurringSeriesList />
      </TabsContent>
    </Tabs>
  );
}
