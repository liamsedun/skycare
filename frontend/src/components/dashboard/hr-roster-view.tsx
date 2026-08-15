"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarPlus, CalendarRange, Loader2, Plus, Trash2, X } from "lucide-react";
import ImportExportMenu from "@/components/ui/import-export-menu";
import type { ImportResult } from "@/components/ui/csv-import-modal";
import FilterBar from "@/components/filters/filter-bar";
import { dateStamp, downloadCsv, printTable } from "@/lib/export";
import { inDateRange } from "@/lib/daterange";

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
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [fRole, setFRole] = useState("");
  const [fDept, setFDept] = useState("");
  const [fShift, setFShift] = useState("");
  const [fStatus, setFStatus] = useState("");

  const [showAssign, setShowAssign] = useState(false);
  const [showShift, setShowShift] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [busy, setBusy] = useState(false);

  const [staffId, setStaffId] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [shiftDate, setShiftDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  const [bulkShiftId, setBulkShiftId] = useState("");
  const [bulkFrom, setBulkFrom] = useState("");
  const [bulkTo, setBulkTo] = useState("");
  const [bulkDept, setBulkDept] = useState("");
  const [bulkRole, setBulkRole] = useState("");
  const [bulkStaffIds, setBulkStaffIds] = useState<string[]>([]);
  const [bulkNotes, setBulkNotes] = useState("");
  const [bulkMsg, setBulkMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

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
      if (admin) {
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

  async function bulkAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!bulkShiftId || !bulkFrom || !bulkTo || bulkStaffIds.length === 0) return;
    setBusy(true);
    setBulkMsg(null);
    try {
      const res = await fetch("/api/hr/roster/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shift_id: bulkShiftId,
          from_date: bulkFrom,
          to_date: bulkTo,
          staff_ids: bulkStaffIds,
          notes: bulkNotes.trim() || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to bulk assign");
      const d = body.data ?? {};
      const skippedReasons = new Map<string, number>();
      for (const s of d.skipped ?? []) skippedReasons.set(s.reason, (skippedReasons.get(s.reason) ?? 0) + 1);
      const skipNote = [...skippedReasons.entries()].map(([r, n]) => `${n} ${r}`).join(" · ");
      setBulkMsg({
        kind: "ok",
        text: `Assigned ${d.total} shift${d.total === 1 ? "" : "s"}${d.skipped?.length ? ` · ${d.skipped.length} skipped (${skipNote})` : ""}`,
      });
      setShowBulk(false);
      setBulkStaffIds([]);
      setBulkNotes("");
      await load();
    } catch (e) {
      setBulkMsg({ kind: "err", text: e instanceof Error ? e.message : "Failed to bulk assign" });
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

  const roleOptions = [...new Set(rows.map((r) => r.staff?.users?.role).filter(Boolean))].sort() as string[];
  const deptOptions = [...new Set(rows.map((r) => r.staff?.department).filter(Boolean))].sort() as string[];
  const shiftOptions = [...new Set(rows.map((r) => r.shift?.name).filter(Boolean))].sort() as string[];
  const statusOptions = [...new Set(rows.map((r) => r.status))].sort();

  const visible = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      (r.staff?.users?.full_name ?? "").toLowerCase().includes(q) ||
      (r.staff?.users?.role ?? "").toLowerCase().includes(q) ||
      (r.shift?.name ?? "").toLowerCase().includes(q) ||
      r.status.toLowerCase().includes(q);
    if (fRole && r.staff?.users?.role !== fRole) return false;
    if (fDept && r.staff?.department !== fDept) return false;
    if (fShift && r.shift?.name !== fShift) return false;
    if (fStatus && r.status !== fStatus) return false;
    return matchesSearch && inDateRange(r.shift_date, from, to);
  });

  const byDate = new Map<string, Assignment[]>();
  for (const r of visible) {
    const list = byDate.get(r.shift_date) ?? [];
    list.push(r);
    byDate.set(r.shift_date, list);
  }
  const dates = [...byDate.keys()].sort();

  const bulkCandidates = staff.filter((s) => s.users?.is_active !== false).filter((s) => !bulkDept || s.department === bulkDept).filter((s) => !bulkRole || s.users?.role === bulkRole);
  const bulkDeptOptions = [...new Set(staff.map((s) => s.department).filter(Boolean))].sort() as string[];
  const bulkRoleOptions = [...new Set(staff.map((s) => s.users?.role).filter(Boolean))].sort() as string[];
  const bulkDays = !bulkFrom || !bulkTo || bulkTo < bulkFrom ? 0 : Math.floor((Date.parse(bulkTo) - Date.parse(bulkFrom)) / 86400000) + 1;
  const toggleStaff = (id: string) =>
    setBulkStaffIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const selectAllCandidates = () =>
    setBulkStaffIds((prev) => [...new Set([...prev, ...bulkCandidates.map((s) => s.id)])]);
  const clearCandidates = () =>
    setBulkStaffIds((prev) => prev.filter((id) => !bulkCandidates.some((s) => s.id === id)));

  const HR_ROSTER_EXPORT_COLUMNS = [
    "shift_date",
    "staff",
    "role",
    "department",
    "shift",
    "time",
    "status",
    "notes",
  ];

  function hrRosterRows() {
    return visible.map((r) => [
      r.shift_date,
      r.staff?.users?.full_name ?? "",
      r.staff?.users?.role ?? "",
      r.staff?.department ?? "",
      r.shift?.name ?? "",
      r.shift ? `${String(r.shift.start_time).slice(0, 5)}–${String(r.shift.end_time).slice(0, 5)}` : "",
      r.status,
      r.notes ?? "",
    ]);
  }

  function exportHrRosterCsv() {
    if (visible.length === 0) {
      alert("Nothing to export — there are no shift assignments this month.");
      return;
    }
    downloadCsv(`shift-roster-${month}.csv`, HR_ROSTER_EXPORT_COLUMNS, hrRosterRows());
  }

  function exportHrRosterPdf() {
    if (visible.length === 0) {
      alert("Nothing to export — there are no shift assignments this month.");
      return;
    }
    printTable(`Shift & Roster — ${month}`, HR_ROSTER_EXPORT_COLUMNS, hrRosterRows());
  }

  const HR_ROSTER_IMPORT_COLUMNS = ["staff_id", "shift_id", "shift_date", "notes"];

  async function importHrRoster(importRows: string[][]): Promise<ImportResult> {
    const errors: string[] = [];
    let created = 0;
    for (let i = 0; i < importRows.length; i++) {
      const r = importRows[i];
      const rowNo = i + 2;
      const staff_id = r[0]?.trim() ?? "";
      const shift_id = r[1]?.trim() ?? "";
      const shift_date = r[2]?.trim() ?? "";
      if (!staff_id || !shift_id || !shift_date) {
        errors.push(`Row ${rowNo}: staff_id, shift_id and shift_date are required`);
        continue;
      }
      try {
        const res = await fetch("/api/hr/roster", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            staff_id,
            shift_id,
            shift_date,
            notes: r[3]?.trim() || undefined,
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to assign shift");
        created++;
      } catch (e) {
        errors.push(
          `Row ${rowNo}: ${e instanceof Error ? e.message : "Failed to assign shift"}`
        );
      }
    }
    return { created, failed: errors.length, errors };
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input type="month" className={inputCls + " max-w-[180px]"} value={month} onChange={(e) => setMonth(e.target.value)} />
        <FilterBar
          query={search}
          onQueryChange={setSearch}
          from={from}
          to={to}
          onFromChange={setFrom}
          onToChange={setTo}
          onClear={() => { setSearch(""); setFrom(""); setTo(""); setFRole(""); setFDept(""); setFShift(""); setFStatus(""); }}
          searchPlaceholder="Search staff, shift or status…"
          searchWidth={230}
        />
        {isAdmin && (
          <>
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-90" onClick={() => setShowAssign(true)}>
              <Plus className="h-4 w-4" /> Assign shift
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-muted)]" onClick={() => setShowBulk(true)}>
              <CalendarPlus className="h-4 w-4" /> Bulk assign
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-muted)]" onClick={() => setShowShift(true)}>
              <CalendarRange className="h-4 w-4" /> New shift template
            </button>
          </>
        )}
        <ImportExportMenu
          entityLabel="Shift Assignments"
          exportCsv={exportHrRosterCsv}
          exportPdf={exportHrRosterPdf}
          importColumns={HR_ROSTER_IMPORT_COLUMNS}
          importSample={[["<staff_id>", "<shift_id>", "2026-09-01", "Ward A"]]}
          templateFilename="shift-roster-import-template.csv"
          onImport={importHrRoster}
          onImported={() => load()}
        />
        <span className="text-sm text-[var(--color-muted-fg)]">{visible.length} assignments · {shifts.filter((s) => s.is_active).length} shift templates</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select className={inputCls + " max-w-[180px]"} value={fRole} onChange={(e) => setFRole(e.target.value)} aria-label="Filter by role">
          <option value="">All roles</option>
          {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select className={inputCls + " max-w-[200px]"} value={fDept} onChange={(e) => setFDept(e.target.value)} aria-label="Filter by department">
          <option value="">All departments</option>
          {deptOptions.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className={inputCls + " max-w-[200px]"} value={fShift} onChange={(e) => setFShift(e.target.value)} aria-label="Filter by shift">
          <option value="">All shifts</option>
          {shiftOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={inputCls + " max-w-[160px]"} value={fStatus} onChange={(e) => setFStatus(e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>
          {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {(fRole || fDept || fShift || fStatus) && (
          <button className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-muted)]" onClick={() => { setFRole(""); setFDept(""); setFShift(""); setFStatus(""); }}>
            Clear filters
          </button>
        )}
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

      {showBulk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowBulk(false)}>
          <form className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()} onSubmit={bulkAssign}>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold">Bulk assign shifts</h3>
                <p className="mt-0.5 text-xs text-[var(--color-muted-fg)]">Assign one shift template to many staff across a date range.</p>
              </div>
              <button type="button" className="rounded-lg p-1.5 hover:bg-[var(--color-muted)]" onClick={() => { setShowBulk(false); setBulkMsg(null); }}><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className={labelCls}>Shift</label>
                  <select className={inputCls} value={bulkShiftId} onChange={(e) => setBulkShiftId(e.target.value)} required>
                    <option value="">Select shift…</option>
                    {shifts.filter((s) => s.is_active).map((s) => (
                      <option key={s.id} value={s.id}>{s.name} · {String(s.start_time).slice(0, 5)}–{String(s.end_time).slice(0, 5)}{s.department ? ` · ${s.department}` : ""}{s.ward?.name ? ` · ${s.ward.name}` : ""}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>From</label>
                  <input type="date" className={inputCls} value={bulkFrom} onChange={(e) => setBulkFrom(e.target.value)} required />
                </div>
                <div>
                  <label className={labelCls}>To</label>
                  <input type="date" className={inputCls} value={bulkTo} onChange={(e) => setBulkTo(e.target.value)} required />
                </div>
              </div>
              <div>
                <label className={labelCls}>Notes</label>
                <input className={inputCls} placeholder="Optional — applied to every assigned shift" value={bulkNotes} onChange={(e) => setBulkNotes(e.target.value)} />
              </div>
              <div>
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-[var(--color-foreground)]">Staff</span>
                  <select className={inputCls + " max-w-[220px]"} value={bulkDept} onChange={(e) => setBulkDept(e.target.value)} aria-label="Narrow by department">
                    <option value="">All departments</option>
                    {bulkDeptOptions.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <select className={inputCls + " max-w-[220px]"} value={bulkRole} onChange={(e) => setBulkRole(e.target.value)} aria-label="Narrow by role">
                    <option value="">All roles</option>
                    {bulkRoleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <button type="button" className="rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium hover:bg-[var(--color-muted)]" onClick={selectAllCandidates}>Select all {bulkCandidates.length}</button>
                  <button type="button" className="rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium hover:bg-[var(--color-muted)]" onClick={clearCandidates}>Clear</button>
                </div>
                <div className="max-h-56 overflow-y-auto rounded-xl border border-[var(--color-border)]">
                  {bulkCandidates.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-[var(--color-muted-fg)]">No active staff match these filters.</div>
                  ) : (
                    <div className="divide-y divide-[var(--color-border)]">
                      {bulkCandidates.map((s) => (
                        <label key={s.id} className="flex cursor-pointer items-center gap-3 px-4 py-2 text-sm hover:bg-[var(--color-muted)]">
                          <input type="checkbox" className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]" checked={bulkStaffIds.includes(s.id)} onChange={() => toggleStaff(s.id)} />
                          <span className="font-medium">{s.users?.full_name}</span>
                          <span className="text-xs text-[var(--color-muted-fg)]">{s.users?.role}{s.department ? ` · ${s.department}` : ""}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="rounded-xl bg-sky-50 px-4 py-2.5 text-sm font-medium text-sky-800">
                {bulkStaffIds.length} staff × {bulkDays} day{bulkDays === 1 ? "" : "s"} = {bulkStaffIds.length * bulkDays} shift{bulkStaffIds.length * bulkDays === 1 ? "" : "s"}
              </div>
              {bulkMsg?.kind === "ok" && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{bulkMsg.text}</div>}
              {bulkMsg?.kind === "err" && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{bulkMsg.text}</div>}
              <button type="submit" disabled={busy || bulkStaffIds.length === 0 || !bulkShiftId || !bulkFrom || !bulkTo} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Assign {bulkStaffIds.length * bulkDays} shift{bulkStaffIds.length * bulkDays === 1 ? "" : "s"}
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
