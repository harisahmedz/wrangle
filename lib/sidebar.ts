export const SIDEBAR_COLLAPSED_KEY = "wrangle-sidebar-collapsed";

export function toggleSidebarCollapsed() {
  const el = document.documentElement;
  const next = !el.classList.contains("sidebar-collapsed");
  el.classList.toggle("sidebar-collapsed", next);
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
  } catch {}
}
