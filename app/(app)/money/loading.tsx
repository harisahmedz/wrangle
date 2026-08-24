import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-9 w-28" />
      </div>
      <Skeleton className="h-36 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
