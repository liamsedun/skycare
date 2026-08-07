// Duty-roster date/time formatting shared by the roster API and UI.

export function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-NG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function fmtTime(value: string | null | undefined): string {
  if (!value) return "—";
  const [h, m] = value.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return value;
  const ampm = h >= 12 ? "PM" : "AM";
  const hh = ((h % 12) || 12).toString().padStart(2, "0");
  return `${hh}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}