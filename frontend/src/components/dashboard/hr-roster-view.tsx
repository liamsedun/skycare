"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarRange, Loader2, Plus, Trash2, X } from "lucide-react";

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";

interface Shift {
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

interface Assignment {
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

interface StaffOpt {
  id: string;
  staff_number: string;
  department: string | null;
  users: { full_name: string; role: string; is_active: boolean } | null;
}

const STATUS_CLASS: Record<string, string> = {
  scheduled: "bg-sky-100 text-sky-700",
  completed: "bg-emerald-100 text-emerald-700",
  missed: "bg-rose-100 text-rose-700",
  cancelled: "bg-slate-100 text-slate-500",
};

export default function HrRosterView() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [rows, setRows] = useState<Assignment[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [staff, setStaff] = useState<StaffOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [showAssign, setShowAssign] = useState(false);
  const [showShift, setShowShift] = useState(false);
  const [busy, setBusy] = useState(false);

  const [staffId, setStaffId] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [shiftDate, setShiftDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  const [shiftName, setShiftName] = useState("");
  const [shiftStart, setShiftStart] = useState("08:00");
  const [shiftEnd, setShiftEnd] = useState("16:00");
  const [shiftDept, setShiftDept] = useState("");
  const [shiftColor, setShiftColor] = useState("#0ea5e9");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const meRes = await fetch("/api/auth/me", { cache: "no-store" });
      const me = await meRes.json();
      const admin = ["hospital_admin", "hr_officer", "super_admin"].includes(me.data?.claims?.role);
      setIsAdmin(admin);
      const [r, s] = await Promise.all([
        fetch(`/api/hr/roster?month=${month}`, { cache: "no-store" }),
        fetch("/api/hr/shifts", { cache: "no-store" }),
      ]);
      const rb = await r.json();
      const sb = await s.json();
      if (!r.ok) throw new Error(rb.error ?? "Failed to load roster");
      if (!s.ok) throw new Error(sb.error ?? "Failed to load shifts");
      setRows(rb.data ?? []);
      setShifts(sb.data ?? []);
      if (admin && staff.length === 0) {
        const stRes = await fetch("/api/hr/staff?pageSize=200", { cache: "no-store" });
        const stb = await stRes.json();
        if (stRes.ok) setStaff(stb.data ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load roster");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  async function assign(e: React.FormEvent) {
    e.preventDefault();
    if (!staffId || !shiftId || !shiftDate) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/hr/roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staff_id: staffId, shift_id: shiftId, shift_date: shiftDate, notes: notes.trim() || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to assign shift");
      setShowAssign(false);
      setNotes("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to assign shift");
    } finally {
      setBusy(false);
    }
  }

  async function createShift(e: React.FormEvent) {
    e.preventDefault();
    if (!shiftName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/hr/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: shiftName, start_time: shiftStart, end_time: shiftEnd, department: shiftDept.trim() || undefined, color: shiftColor }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to create shift");
      setShowShift(false);
      setShiftName("");
      setShiftDept("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create shift");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/hr/roster/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const b = await res.json();
        throw new Error(b.error ?? "Failed to update");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Remove this shift assignment?")) return;
    try {
      const res = await fetch(`/api/hr/roster/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const b = await res.json();
        throw new Error(b.error ?? "Failed to remove");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove");
    }
  }

  const byDate = new Map<string, Assignment[]>();
  for (const r of rows) {
    const list = byDate.get(r.shift_date) ?? [];
    list.push(r);
    byDate.set(r.shift_date, list);
  }
  const dates = [...byDate.keys()].sort();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input type="month" className={inputCls + " max-w-[180px]"} value={month} onChange={(e) => setMonth(e.target.value)} />
        {isAdmin && (
          <>
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-90" onClick={() => setShowAssign(true)}>
              <Plus className="h-4 w-4" /> Assign shift
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-muted)]" onClick={() => setShowShift(true)}>
              <CalendarRange className="h-4 w-4" /> New shift template
            </button>
          </>
        )}
        <span className="text-sm text-[var(--color-muted-fg)]">{rows.length} assignments · {shifts.filter((s) => s.is_active).length} shift templates</span>
      </div>

      {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--color-muted-fg)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading roster…
        </div>
      ) : (
        <div className="space-y-4">
          {dates.map((d) => (
            <div key={d} className="rounded-2xl border border-[var(--color-border)] bg-white">
              <div className="border-b border-[var(--color-border)] px-4 py-2.5 text-sm font-semibold">
                {new Date(`${d}T00:00:00`).toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
              </div>
              <div className="divide-y divide-[var(--color-border)]">
                {byDate.get(d)!.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.shift?.color ?? "#94a3b8" }} />
                    <div className="min-w-[140px]">
                      <div className="font-medium">{r.staff?.users?.full_name}</div>
                      <div className="text-xs text-[var(--color-muted-fg)]">{r.staff?.users?.role}{r.staff?.department ? ` · ${r.staff.department}` : ""}</div>
                    </div>
                    <div className="min-w-[120px]">
                      <div className="font-medium">{r.shift?.name ?? "—"}</div>
                      <div className="text-xs text-[var(--color-muted-fg)]">
                        {r.shift ? `${String(r.shift.start_time).slice(0, 5)}–${String(r.shift.end_time).slice(0, 5)}` : ""}{r.ward?.name ? ` · ${r.ward.name}` : ""}
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[r.status] ?? "bg-slate-100 text-slate-500"}`}>{r.status}</span>
                    {r.notes && <span className="max-w-[220px] truncate text-xs text-[var(--color-muted-fg)]">{r.notes}</span>}
                    {isAdmin && (
                      <div className="ml-auto flex items-center gap-1.5">
                        {r.status === "scheduled" && (
                          <button className="rounded-lg border border-[var(--color-border)] px-2 py-1 text-xs font-medium hover:bg-[var(--color-muted)]" onClick={() => setStatus(r.id, "completed")}>Complete</button>
                        )}
                        <button className="rounded-lg border border-[var(--color-border)] px-2 py-1 text-xs font-medium hover:bg-[var(--color-muted)]" onClick={() => setStatus(r.id, r.status === "cancelled" ? "scheduled" : "cancelled")}>
                          {r.status === "cancelled" ? "Restore" : "Cancel"}
                        </button>
                        <button className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50" onClick={() => remove(r.id)}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {dates.length === 0 && (
            <div className="rounded-2xl border border-[var(--color-border)] bg-white px-4 py-12 text-center text-sm text-[var(--color-muted-fg)]">
              No shifts assigned this month.
            </div>
          )}
        </div>
      )}

      {showAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowAssign(false)}>
          <form className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()} onSubmit={assign}>
            <div className="mb-4 flex items-start justify-between">
              <h3 className="text-lg font-semibold">Assign shift</h3>
              <button type="button" className="rounded-lg p-1.5 hover:bg-[var(--color-muted)]" onClick={() => setShowAssign(false)}><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Staff member</label>
                <select className={inputCls} value={staffId} onChange={(e) => setStaffId(e.target.value)} required>
                  <option value="">Select staff…</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>{s.users?.full_name} · {s.users?.role}{s.users?.is_active === false ? " (disabled)" : ""}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Shift</label>
                <select className={inputCls} value={shiftId} onChange={(e) => setShiftId(e.target.value)} required>
                  <option value="">Select shift…</option>
                  {shifts.filter((s) => s.is_active).map((s) => (
                    <option key={s.id} value={s.id}>{s.name} · {String(s.start_time).slice(0, 5)}–{String(s.end_time).slice(0, 5)}{s.department ? ` · ${s.department}` : ""}{s.ward?.name ? ` · ${s.ward.name}` : ""}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Date</label>
                <input type="date" className={inputCls} value={shiftDate} onChange={(e) => setShiftDate(e.target.value)} required />
              </div>
              <div>
                <label className={labelCls}>Notes</label>
                <input className={inputCls} placeholder="Optional" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
              <button type="submit" disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Assign
              </button>
            </div>
          </form>
        </div>
      )}

      {showShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowShift(false)}>
          <form className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()} onSubmit={createShift}>
            <div className="mb-4 flex items-start justify-between">
              <h3 className="text-lg font-semibold">New shift template</h3>
              <button type="button" className="rounded-lg p-1.5 hover:bg-[var(--color-muted)]" onClick={() => setShowShift(false)}><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Name</label>
                <input className={inputCls} placeholder="Morning" value={shiftName} onChange={(e) => setShiftName(e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Start</label>
                  <input type="time" className={inputCls} value={shiftStart} onChange={(e) => setShiftStart(e.target.value)} required />
                </div>
                <div>
                  <label className={labelCls}>End</label>
                  <input type="time" className={inputCls} value={shiftEnd} onChange={(e) => setShiftEnd(e.target.value)} required />
                </div>
              </div>
              <div>
                <label className={labelCls}>Department</label>
                <input className={inputCls} placeholder="Nursing" value={shiftDept} onChange={(e) => setShiftDept(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Colour</label>
                <input type="color" className={inputCls + " h-11"} value={shiftColor} onChange={(e) => setShiftColor(e.target.value)} />
              </div>
              {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
              <button type="submit" disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
