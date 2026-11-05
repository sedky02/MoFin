import { Suspense } from "react";
import { AskView } from "@/components/ask/ask-view";
import { Skeleton } from "@/components/ui/skeleton";

// The chat list groups chats by "today" and "yesterday", which reads the clock; under
// cacheComponents that has to sit inside a <Suspense> boundary, not in the static shell.
export default function AskPage() {
  return (
    <Suspense fallback={<AskSkeleton />}>
      <AskView />
    </Suspense>
  );
}

function AskSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]" aria-label="Loading">
      <div className="hidden space-y-2 lg:block">
        <Skeleton className="h-9 w-full rounded-xl" />
        <Skeleton className="h-9 w-full rounded-xl" />
      </div>
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    </div>
  );
}
