import { cn } from "@/lib/utils";
import type { InputHTMLAttributes } from "react";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-md bg-surface-2 border border-border px-3 text-sm text-text placeholder:text-muted transition-colors focus:border-accent focus:outline-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
