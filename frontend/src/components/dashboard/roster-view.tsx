"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarRange, ChevronLeft, ChevronRight, Loader2, Plus, Trash2 } from "lucide-react";

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";

interface RosterRow {
  id: string;
  shift_date: string;
  from_time: string;
  until_time: string;
  note: string | null;
  staff: { id: string; staff_number: string; department: string | null; users: { full_name: string; role: string } | null } | null;
}

interface StaffOption {
  id: string;
  full_name: string;
  role: string;
  department: string | null;
  staff_number: string;
}

function mondayOf(d: Date): Date {
  const day = (d.getDay() + 6) % 7;
  const m = new Date(d);
  m.setDate(d.getDate() - day);
  m.setHours(0, 0, 0, 0);
  return m;
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function RosterView() {
  const [monday, setMonday] = useState(() => mondayOf(new Date()));
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [showAssign, setShowAssign] = useState(false);
  const [assignDate, setAssignDate] = useState("");
  const [staffId, setStaffId] = useState("");
  const [fromTime, setFromTime] = useState("08:00");
  const [untilTime, setUntilTime] = useState("17:00");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return toISO(d);
    });
  }, [monday]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const meRes = await fetch("/api/auth/me", { cache: "no-store" });
      const me = await meRes.json();
      const role = me.data?.claims?.role;
      setIsAdmin(role === "hospital_admin" || role === "super_admin");

      const from = weekDays[0];
      const to = weekDays[6];
      const [res, staffRes] = await Promise.all([
        fetch(`/api/duty-roster?from=${from}&to=${to}`, { cache: "no-store" }),
        isAdmin ? fetch("/api/staff?pageSize=100", { cache: "no-store" }) : Promise.resolve(null),
      ]);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load roster");
      setRows(body.data ?? []);
      if (staffRes) {
        const sb = await staffRes.json();
        setStaff(
          (sb.data ?? []).map((s: any) => ({
            id: s.id,
            full_name: s.users?.full_name ?? "Unnamed",
            role: s.users?.role ?? "",
            department: s.department,
            staff_number: s.staff_number,
          }))
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load roster");
    } finally {
      setLoading(false);
    }
  }, [weekDays, isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  function moveWeek(dir: number) {
    const d = new Date(monday);
    d.setDate(d.getDate() + dir * 7);
    setMonday(d);
  }

  async function assign(e: React.FormEvent) {
    e.preventDefault();
    if (!staffId || !assignDate || !fromTime || !untilTime) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/duty-roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId, shiftDate: assignDate, fromTime, untilTime, note: note.trim() || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to assign shift");
      setShowAssign(false);
      setNote("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to assign shift");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/duty-roster/${id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to remove shift");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove shift");
    } finally {
      setBusy(false);
    }
  }

  const byDay = useMemo(() => {
    const map = new Map<string, RosterRow[]>();
    for (const w of weekDays) map.set(w, []);
    for (const r of rows) {
      const list = map.get(r.shift_date);
      if (list) list.push(r);
    }
    return map;
  }, [rows, weekDays]);

  const weekLabel = `${weekDays[0].slice(5).split("-").reverse().join("/")} – ${weekDays[6].slice(5).split("-").reverse().join("/")}`;
  const todayISO = toISO(new Date());

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold text-[var(--color-foreground)]">Duty roster</h1>
          <p className="mt-1 text-sm text-[var(--color-muted-fg)]">Weekly shift assignments.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => moveWeek(-1)} className="focus-ring rounded-lg border border-[var(--color-border)] p-2 text-[var(--color-muted-fg)] hover:bg-slate-50" aria-label="Previous week">
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-32 text-center text-sm font-semibold text-[var(--color-foreground)]">{weekLabel}</span>
          <button type="button" onClick={() => moveWeek(1)} className="focus-ring rounded-lg border border-[var(--color-border)] p-2 text-[var(--color-muted-fg)] hover:bg-slate-50" aria-label="Next week">
            <ChevronRight size={16} />
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                setAssignDate(todayISO);
                setShowAssign(true);
              }}
              className="focus-ring ml-2 inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)]"
            >
              <Plus size={15} /> Assign shift
            </button>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={22} aria-hidden="true" className="animate-spin text-[var(--color-muted-fg)]" />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {weekDays.map((day) => {
            const shifts = byDay.get(day) ?? [];
            const isToday = day === todayISO;
            const dateLabel = new Date(`${day}T00:00:00`).toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short" });
            return (
              <div key={day} className={`rounded-xl border bg-white p-3.5 shadow-[var(--shadow-sm)] ${isToday ? "border-[var(--color-primary)]" : "border-[var(--color-border)]"}`}>
                <div className="mb-2.5 flex items-center justify-between">
                  <p className={`text-sm font-semibold ${isToday ? "text-[var(--color-primary-dark)]" : "text-[var(--color-foreground)]"}`}>
                    {dateLabel}
                    {isToday && <span className="ml-2 rounded-full bg-[var(--color-primary)] px-2 py-0.5 text-[10px] font-semibold text-white">Today</span>}
                  </p>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setAssignDate(day);
                        setShowAssign(true);
                      }}
                      className="focus-ring rounded-lg p-1 text-[var(--color-muted-fg)] hover:bg-slate-100 hover:text-[var(--color-primary)]"
                      aria-label={`Assign shift on ${day}`}
                    >
                      <Plus size={14} />
                    </button>
                  )}
                </div>
                {shifts.length === 0 ? (
                  <p className="py-4 text-center text-xs text-[var(--color-muted-fg)]">No shifts</p>
                ) : (
                  <ul className="space-y-1.5">
                    {shifts.map((s) => (
                      <li key={s.id} className="flex items-start justify-between gap-2 rounded-lg bg-[var(--color-muted-soft)] px-2.5 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-[var(--color-foreground)]">
                            {s.staff?.users?.full_name ?? "Unknown staff"}
                          </p>
                          <p className="text-[11px] text-[var(--color-muted-fg)]">
                            {s.from_time.slice(0, 5)} – {s.until_time.slice(0, 5)}
                            {s.note ? ` · ${s.note}` : ""}
                          </p>
                        </div>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => remove(s.id)}
                            disabled={busy}
                            className="focus-ring shrink-0 rounded-lg p-1 text-[var(--color-muted-fg)] hover:bg-rose-50 hover:text-[var(--color-destructive)] disabled:opacity-50"
                            aria-label="Remove shift"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Assign shift">
          <form onSubmit={assign} className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-xl)]">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-[family-name:var(--font-heading)] text-lg font-bold text-[var(--color-foreground)]">
                <CalendarRange size={18} /> Assign shift
              </h2>
              <button type="button" onClick={() => setShowAssign(false)} className="focus-ring rounded-lg p-2 text-[var(--color-muted-fg)] hover:bg-slate-100" aria-label="Close">
                ✕
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className={labelCls} htmlFor="rs-date">Date</label>
                <input id="rs-date" type="date" className={inputCls} value={assignDate} onChange={(e) => setAssignDate(e.target.value)} required />
              </div>
              <div>
                <label className={labelCls} htmlFor="rs-staff">Staff member</label>
                <select id="rs-staff" className={inputCls} value={staffId} onChange={(e) => setStaffId(e.target.value)} required>
                  <option value="" disabled>Select staff</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name} · {s.role}
                      {s.department ? ` · ${s.department}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls} htmlFor="rs-from">From</label>
                  <input id="rs-from" type="time" className={inputCls} value={fromTime} onChange={(e) => setFromTime(e.target.value)} required />
                </div>
                <div>
                  <label className={labelCls} htmlFor="rs-until">Until</label>
                  <input id="rs-until" type="time" className={inputCls} value={untilTime} onChange={(e) => setUntilTime(e.target.value)} required />
                </div>
              </div>
              <div>
                <label className={labelCls} htmlFor="rs-note">Note</label>
                <input id="rs-note" type="text" className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setShowAssign(false)} className="focus-ring rounded-lg border border-[var(--color-border)] px-3.5 py-2 text-sm font-medium text-[var(--color-foreground)] hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={busy} className="focus-ring rounded-lg bg-[var(--color-primary)] px-3.5 py-2 text-sm font-medium text-white disabled:opacity-60">
                {busy ? "Saving…" : "Assign"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}