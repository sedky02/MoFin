"use client";

import * as React from "react";
import { Activity } from "react";
import Link from "next/link";
import { ArrowRight, MessageCircle } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/common/page-header";
import { DraftComposer } from "@/components/drafts/draft-composer";
import { DraftList } from "@/components/drafts/draft-list";
import type { DraftStatus } from "@/lib/types";

export default function DraftsPage() {
  const [tab, setTab] = React.useState<DraftStatus>("PENDING");

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Drafts"
        description="Describe what you spent or earned. Review what MoFin understood. Approve to record."
      />

      <DraftComposer />

      <Link
        href="/ask"
        className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
      >
        <MessageCircle className="size-4 shrink-0" aria-hidden />
        <span className="flex-1">Have a question about your money? Ask MoFin</span>
        <ArrowRight className="size-4 shrink-0" aria-hidden />
      </Link>

      <div className="mt-8">
        <Tabs value={tab} onValueChange={(v) => setTab(v as DraftStatus)}>
          <TabsList className="w-full">
            <TabsTrigger value="PENDING" className="flex-1">
              Pending
            </TabsTrigger>
            <TabsTrigger value="APPROVED" className="flex-1">
              Approved
            </TabsTrigger>
            <TabsTrigger value="REJECTED" className="flex-1">
              Rejected
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="mt-4">
          {/* Active panel renders; the other two stay mounted but hidden via <Activity>
                so their scroll/expanded state and query cache survive tab switches. */}
          {tab === "PENDING" && <DraftList status="PENDING" />}

          <Activity mode={tab === "APPROVED" ? "visible" : "hidden"}>
            <DraftList status="APPROVED" />
          </Activity>

          <Activity mode={tab === "REJECTED" ? "visible" : "hidden"}>
            <DraftList status="REJECTED" />
          </Activity>
        </div>
      </div>
    </div>
  );
}
