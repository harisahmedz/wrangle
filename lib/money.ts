export function parseAmountToMinor(input: string): number | null {
  const cleaned = input.replace(/[^0-9.]/g, "");
  if (!cleaned || cleaned === ".") return null;
  const parts = cleaned.split(".");
  if (parts.length > 2) return null;
  const whole = parts[0] ?? "0";
  let frac = (parts[1] ?? "").slice(0, 2);
  while (frac.length < 2) frac += frac.length === 0 && parts.length === 1 ? "00" : "0";
  const value = Number(`${whole || "0"}.${frac}`);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

export function formatMinor(minor: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(minor / 100);
}

export function monthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthBounds(key: string): { startDate: string; endDate: string } {
  const [y, m] = key.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: iso(start), endDate: iso(end) };
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function todayKey(timeZone: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}
