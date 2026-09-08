import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6" aria-label="Loading page">
      <Skeleton className="h-8 w-40" />
      <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-4/5" />
      </div>
    </div>
  );
}
