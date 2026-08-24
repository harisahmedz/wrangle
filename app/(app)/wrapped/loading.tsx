import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mx-auto h-[480px] w-full max-w-[380px]" />
      <Skeleton className="mx-auto h-12 w-full max-w-[380px]" />
    </div>
  );
}
