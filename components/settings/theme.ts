import type { ThemeMode } from "@/lib/validation/settings";

export function applyTheme(mode: ThemeMode) {
  try {
    localStorage.setItem("wrangle-theme", mode);
  } catch {}
  const light =
    mode === "light" ||
    (mode === "system" &&
      window.matchMedia("(prefers-color-scheme: light)").matches);
  document.documentElement.classList.toggle("light", light);
}
