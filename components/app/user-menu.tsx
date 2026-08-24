"use client";

import { useState } from "react";
import Link from "next/link";
import { SignOutIcon } from "@/components/icons";
import { signOutAction } from "@/lib/actions/auth";

function WrappedIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className ?? "h-5 w-5"}
    >
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z" />
      <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z" />
    </svg>
  );
}

export function UserMenu({
  name,
  image,
}: {
  name?: string | null;
  image?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const initial = name?.trim()?.charAt(0)?.toUpperCase() ?? "?";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-2 text-sm font-semibold"
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="h-full w-full object-cover" />
        ) : (
          initial
        )}
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            role="presentation"
          />
          <div
            role="menu"
            className="absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg"
          >
            <div className="truncate px-4 py-2 text-xs text-muted">{name}</div>
            <Link
              href="/wrapped"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-muted hover:bg-surface-2 hover:text-text"
            >
              <WrappedIcon className="h-4 w-4" />
              Life Wrapped
            </Link>
            <form action={signOutAction}>
              <button
                type="submit"
                role="menuitem"
                className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-muted hover:bg-surface-2 hover:text-text"
              >
                <SignOutIcon className="h-4 w-4" />
                Sign out
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
