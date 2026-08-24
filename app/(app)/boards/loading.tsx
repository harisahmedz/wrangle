import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-8 w-28" />
      <div className="-mx-4 flex gap-3 overflow-hidden px-4 md:-mx-8 md:px-8">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="w-[272px] shrink-0 space-y-2 rounded-xl bg-surface-2/60 p-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
