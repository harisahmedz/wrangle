import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 font-medium rounded-md transition-colors select-none disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-strong shadow-sm",
  secondary:
    "bg-surface-2 text-text border border-border hover:bg-surface hover:border-muted/40",
  ghost: "text-muted hover:text-text hover:bg-surface-2",
  danger:
    "bg-danger/10 text-danger border border-danger/30 hover:bg-danger hover:text-white",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

export function buttonStyles(opts?: {
  variant?: Variant;
  size?: Size;
  className?: string;
}) {
  return cn(
    base,
    variants[opts?.variant ?? "primary"],
    sizes[opts?.size ?? "md"],
    opts?.className,
  );
}

export function Button({
  variant,
  size,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
}) {
  return (
    <button
      className={buttonStyles({ variant, size, className })}
      {...props}
    />
  );
}
