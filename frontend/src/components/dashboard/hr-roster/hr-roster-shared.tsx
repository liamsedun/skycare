import { Calendar, CalendarDays, CalendarRange, List, Users } from "lucide-react";

export const inputCls =
  "rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
export const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";

export interface Shift {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  department: string | null;
  ward_id: string | null;
  ward: { name: string } | null;
  color: string;
  is_active: boolean;
}

export interface Assignment {
  id: string;
  staff_id: string;
  shift_id: string | null;
  shift_date: string;
  status: string;
  notes: string | null;
  ward: { name: string } | null;
  staff: { department: string | null; users: { full_name: string; role: string } | null } | null;
  shift: { name: string; start_time: string; end_time: string; color: string } | null;
}

export interface StaffOpt {
  id: string;
  staff_number: string;
  department: string | null;
  users: { full_name: string; role: string; is_active: boolean } | null;
}

export type TabKey = "list" | "staff" | "day" | "week" | "month";

export const STATUS_CLASS: Record<string, string> = {
  scheduled: "bg-sky-100 text-sky-700",
  completed: "bg-emerald-100 text-emerald-700",
  missed: "bg-rose-100 text-rose-700",
  cancelled: "bg-slate-100 text-slate-500",
};

export const TXT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function toLocalStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function parseLocal(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(s: string, n: number): string {
  const d = parseLocal(s);
  d.setDate(d.getDate() + n);
  return toLocalStr(d);
}
export function mondayOf(s: string): string {
  const d = parseLocal(s);
  const back = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - back);
  return toLocalStr(d);
}
export function fmtDay(s: string): string {
  return parseLocal(s).toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short" });
}
export function fmtDayLong(s: string): string {
  return parseLocal(s).toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "short", year: "numeric" });
}
export function isToday(s: string): boolean {
  return s === toLocalStr(new Date());
}
export function monthGrid(month: string): { key: string; date: string; inMonth: boolean }[] {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const start = mondayOf(toLocalStr(first));
  const cells: { key: string; date: string; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const date = addDays(start, i);
    cells.push({ key: date, date, inMonth: date.slice(0, 7) === month });
  }
  return cells;
}

export const TABS: { key: TabKey; label: string; icon: typeof List }[] = [
  { key: "list", label: "List", icon: List },
  { key: "staff", label: "Per Staff", icon: Users },
  { key: "day", label: "Per Day", icon: CalendarDays },
  { key: "week", label: "Per Week", icon: CalendarRange },
  { key: "month", label: "Per Month", icon: Calendar },
];
