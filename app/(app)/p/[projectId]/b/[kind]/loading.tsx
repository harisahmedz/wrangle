import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="flex gap-3 overflow-hidden">
        {[0, 1, 2].map((i) => (
          <div key={i} className="w-[272px] shrink-0 space-y-2 rounded-xl bg-surface-2/60 p-2">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
