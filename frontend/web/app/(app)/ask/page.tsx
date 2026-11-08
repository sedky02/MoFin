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
      <div className="flex min-h-[60vh] flex-col">
        <div className="flex flex-1 flex-col items-center justify-center py-10">
          <Skeleton className="size-10 rounded-xl" />
          <Skeleton className="mt-4 h-7 w-64 max-w-full" />
          <Skeleton className="mt-2 h-4 w-52 max-w-full" />
          <div className="mt-7 flex max-w-2xl flex-wrap justify-center gap-2">
            {[36, 44, 32, 40].map((w) => (
              <Skeleton key={w} className="h-9 rounded-full" style={{ width: `${w * 4}px` }} />
            ))}
          </div>
        </div>
        <Skeleton className="mx-auto h-14 w-full max-w-3xl rounded-3xl" />
      </div>
    </div>
  );
}
