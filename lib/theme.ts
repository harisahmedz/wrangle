export function toggleTheme() {
  const el = document.documentElement;
  const next = !el.classList.contains("light");
  el.classList.toggle("light", next);
  try {
    localStorage.setItem("wrangle-theme", next ? "light" : "dark");
  } catch {}
}
