"use client";

import { MoonIcon, SunIcon } from "@/components/icons";
import { toggleTheme } from "@/lib/theme";

export function ThemeToggle() {
  return (
    <button
      onClick={toggleTheme}
      aria-label="Toggle dark or light theme"
      className="flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-text"
    >
      <MoonIcon className="hidden h-5 w-5 light:block" />
      <SunIcon className="h-5 w-5 light:hidden" />
    </button>
  );
}
