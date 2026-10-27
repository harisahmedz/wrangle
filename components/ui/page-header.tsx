import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeftIcon } from "@/components/icons";

export function PageHeader({
  title,
  subtitle,
  back,
  actions,
}: {
  title: string;
  subtitle?: string;
  back?: { href: string; label: string };
  actions?: ReactNode;
}) {
  return (
    <div className="space-y-1">
      {back && (
        <Link
          href={back.href}
          className="inline-flex min-h-11 items-center gap-1 text-sm text-muted transition-colors hover:text-text"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-title font-bold tracking-tight md:text-title-md">
            {title}
          </h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
