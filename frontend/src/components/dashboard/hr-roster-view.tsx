"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarPlus,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  List,
  Loader2,
  Plus,
  Trash2,
  XCircle,
} from "lucide-react";
import { AssignShiftModal } from "./hr-roster/hr-roster-assign-modal";
import { BulkAssignModal } from "./hr-roster/hr-roster-bulk-modal";
import { ShiftFormModal } from "./hr-roster/hr-roster-shift-modal";
import { ShiftTemplatesModal } from "./hr-roster/hr-roster-shifts-modal";
import {
  type Shift,
  type Assignment,
  type StaffOpt,
  type TabKey,
  STATUS_CLASS,
  TXT,
  TABS,
  addDays,
  fmtDay,
  fmtDayLong,
  inputCls,
  isToday,
  labelCls,
  mondayOf,
  monthGrid,
  parseLocal,
  toLocalStr,
} from "./hr-roster/hr-roster-shared";
import ImportExportMenu from "@/components/ui/import-export-menu";
import type { ImportResult } from "@/components/ui/csv-import-modal";
import FilterBar from "@/components/filters/filter-bar";
import { downloadCsv, printTable } from "@/lib/export";
import { inDateRange } from "@/lib/daterange";
import { mutedXs, flexBetween, divideBorder, flexWrapGap2, mutedSmPlain, spinner } from "@/lib/ui-constants";
import BranchFilter from "@/components/dashboard/branch-filter";
import { useBranch } from "@/lib/branch-context";

export default function HrRosterView() {
  const [tab, setTab] = useState<TabKey>("month");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [dayDate, setDayDate] = useState(() => toLocalStr(new Date()));
  const [weekStart, setWeekStart] = useState(() => mondayOf(toLocalStr(new Date())));
  const [staffSel, setStaffSel] = useState("");

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
  const [showShifts, setShowShifts] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [showBulk, setShowBulk] = useState(false);
  const [busy, setBusy] = useState(false);

  const [staffId, setStaffId] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [shiftDate, setShiftDate] = useState(() => toLocalStr(new Date()));
  const [notes, setNotes] = useState("");

  const [bulkShiftId, setBulkShiftId] = useState("");
  const [bulkFrom, setBulkFrom] = useState("");
  const [bulkTo, setBulkTo] = useState("");
  const [bulkDept, setBulkDept] = useState("");
  const [bulkRole, setBulkRole] = useState("");
  const [bulkStaffIds, setBulkStaffIds] = useState<string[]>([]);
  const [bulkNotes, setBulkNotes] = useState("");
  const [bulkMsg, setBulkMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [selIds, setSelIds] = useState<string[]>([]);
  const [selMsg, setSelMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [shiftName, setShiftName] = useState("");
  const [shiftStart, setShiftStart] = useState("08:00");
  const [shiftEnd, setShiftEnd] = useState("16:00");
  const [shiftDept, setShiftDept] = useState("");
  const [shiftColor, setShiftColor] = useState("#0ea5e9");
  const { selectedBranchId } = useBranch();

  const windowQs = useMemo(() => {
    if (tab === "day") return `from=${dayDate}&to=${dayDate}`;
    if (tab === "week") return `from=${weekStart}&to=${addDays(weekStart, 6)}`;
    return `month=${month}`;
  }, [tab, month, dayDate, weekStart]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const meRes = await fetch("/api/auth/me", { cache: "no-store" });
      const me = await meRes.json();
      const admin = ["hospital_admin", "hr_officer"].includes(me.data?.claims?.role);
      setIsAdmin(admin);
      const branchQs = selectedBranchId ? `&branch=${selectedBranchId}` : "";
      const [r, s, st] = await Promise.all([
        fetch(`/api/hr/roster?${windowQs}${branchQs}`, { cache: "no-store" }),
        fetch(`/api/hr/shifts${branchQs.startsWith("&") ? "?" + branchQs.slice(1) : ""}`, { cache: "no-store" }),
        fetch(`/api/hr/staff?pageSize=200${branchQs}`, { cache: "no-store" }),
      ]);
      const rb = await r.json();
      const sb = await s.json();
      const stb = await st.json();
      if (!r.ok) throw new Error(rb.error ?? "Failed to load roster");
      if (!s.ok) throw new Error(sb.error ?? "Failed to load shifts");
      setRows(rb.data ?? []);
      setShifts(sb.data ?? []);
      if (st.ok) setStaff(stb.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load roster");
    } finally {
      setLoading(false);
    }
  }, [windowQs, selectedBranchId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setSelIds((prev) => (prev.length === 0 ? prev : prev.filter((id) => rows.some((r) => r.id === id))));
  }, [rows]);

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
      if (editingShift) {
        const res = await fetch(`/api/hr/shifts/${editingShift.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: shiftName, start_time: shiftStart, end_time: shiftEnd, department: shiftDept.trim() || undefined, color: shiftColor }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to update shift");
      } else {
        const res = await fetch("/api/hr/shifts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: shiftName, start_time: shiftStart, end_time: shiftEnd, department: shiftDept.trim() || undefined, color: shiftColor }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to create shift");
      }
      setShowShift(false);
      setEditingShift(null);
      setShiftName("");
      setShiftDept("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save shift");
    } finally {
      setBusy(false);
    }
  }

  function openEditShift(s: Shift) {
    setEditingShift(s);
    setShiftName(s.name);
    setShiftStart(String(s.start_time).slice(0, 5));
    setShiftEnd(String(s.end_time).slice(0, 5));
    setShiftDept(s.department ?? "");
    setShiftColor(s.color || "#0ea5e9");
    setError(null);
    setShowShifts(false);
    setShowShift(true);
  }

  function openNewShift() {
    setEditingShift(null);
    setShiftName("");
    setShiftDept("");
    setShiftStart("08:00");
    setShiftEnd("16:00");
    setShiftColor("#0ea5e9");
    setError(null);
    setShowShift(true);
  }

  async function deleteShift(s: Shift) {
    if (!window.confirm(`Delete shift template "${s.name}"? Existing assignments will keep their rows but lose the shift reference.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/hr/shifts/${s.id}`, { method: "DELETE" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Failed to delete shift");
      await load();
      setShowShifts(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete shift");
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

  function toggleSel(id: string) {
    setSelIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function bulkStatus(action: "complete" | "cancel" | "delete") {
    if (selIds.length === 0) return;
    const conf =
      action === "delete"
        ? `Permanently remove ${selIds.length} shift assignment(s)? This cannot be undone.`
        : action === "cancel"
          ? `Cancel ${selIds.length} shift assignment(s)?`
          : `Mark ${selIds.length} shift assignment(s) as completed?`;
    if (!window.confirm(conf)) return;
    setBusy(true);
    setSelMsg(null);
    try {
      const res = await fetch("/api/hr/roster/bulk-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids: selIds }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Bulk action failed");
      const d = body.data ?? {};
      const reasons = new Map<string, number>();
      for (const s of d.skipped ?? []) reasons.set(s.reason, (reasons.get(s.reason) ?? 0) + 1);
      const skipNote = [...reasons.entries()].map(([r, n]) => `${n} ${r}`).join(" · ");
      const past = action === "delete" ? "Deleted" : action === "cancel" ? "Cancelled" : "Completed";
      setSelMsg({
        kind: "ok",
        text: `${past} ${d.processed} shift assignment${d.processed === 1 ? "" : "s"}${d.skipped?.length ? ` · ${d.skipped.length} skipped (${skipNote})` : ""}`,
      });
      setSelIds([]);
      await load();
    } catch (e) {
      setSelMsg({ kind: "err", text: e instanceof Error ? e.message : "Bulk action failed" });
    } finally {
      setBusy(false);
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

  const byDate = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    for (const r of visible) {
      const list = map.get(r.shift_date) ?? [];
      list.push(r);
      map.set(r.shift_date, list);
    }
    return map;
  }, [visible]);
  const dates = [...byDate.keys()].sort();

  const byStaff = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    for (const r of visible) {
      const list = map.get(r.staff_id) ?? [];
      list.push(r);
      map.set(r.staff_id, list);
    }
    return map;
  }, [visible]);


  const HR_ROSTER_EXPORT_COLUMNS = ["shift_date", "staff", "role", "department", "shift", "time", "status", "notes"];

  function hrRosterRows() {
    return [...visible]
      .sort((a, b) => (a.shift_date === b.shift_date ? String(a.shift?.start_time).localeCompare(String(b.shift?.start_time)) : a.shift_date.localeCompare(b.shift_date)))
      .map((r) => [
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
      alert("Nothing to export — there are no shift assignments in this window.");
      return;
    }
    downloadCsv(`shift-roster-${month}.csv`, HR_ROSTER_EXPORT_COLUMNS, hrRosterRows());
  }

  function exportHrRosterPdf() {
    if (visible.length === 0) {
      alert("Nothing to export — there are no shift assignments in this window.");
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

  const grid = useMemo(() => monthGrid(month), [month]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const selectedStaff = staff.find((s) => s.id === staffSel);
  const staffRows = byStaff.get(staffSel) ?? [];

  const daySorted = useMemo(
    () => [...(byDate.get(dayDate) ?? [])].sort((a, b) => String(a.shift?.start_time).localeCompare(String(b.shift?.start_time))),
    [byDate, dayDate]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {tab === "list" || tab === "staff" || tab === "month" ? (
          <input type="month" className={inputCls + " max-w-[180px]"} value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Roster month" />
        ) : tab === "week" ? (
          <div className="flex items-center gap-1">
            <button className="rounded-lg border border-[var(--color-border)] p-2 hover:bg-[var(--color-muted)]" onClick={() => setWeekStart((w) => addDays(w, -7))} aria-label="Previous week">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-muted)]" onClick={() => setWeekStart(mondayOf(toLocalStr(new Date())))}>
              This week
            </button>
            <button className="rounded-lg border border-[var(--color-border)] p-2 hover:bg-[var(--color-muted)]" onClick={() => setWeekStart((w) => addDays(w, 7))} aria-label="Next week">
              <ChevronRight className="h-4 w-4" />
            </button>
            <span className="ml-2 text-sm font-medium text-[var(--color-foreground)]">{fmtDay(weekStart)} – {fmtDay(addDays(weekStart, 6))}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <button className="rounded-lg border border-[var(--color-border)] p-2 hover:bg-[var(--color-muted)]" onClick={() => setDayDate((d) => addDays(d, -1))} aria-label="Previous day">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <input type="date" className={inputCls + " max-w-[170px]"} value={dayDate} onChange={(e) => e.target.value && setDayDate(e.target.value)} aria-label="Roster day" />
            {!isToday(dayDate) && (
              <button className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-muted)]" onClick={() => setDayDate(toLocalStr(new Date()))}>
                Today
              </button>
            )}
            <button className="rounded-lg border border-[var(--color-border)] p-2 hover:bg-[var(--color-muted)]" onClick={() => setDayDate((d) => addDays(d, 1))} aria-label="Next day">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
        <BranchFilter value={selectedBranchId} onChange={() => {}} hideWhenSingle />
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
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-muted)]" onClick={openNewShift}>
              <CalendarRange className="h-4 w-4" /> New shift template
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-muted)]" onClick={() => { setShowShifts(true); setShowShift(false); }}>
              <List className="h-4 w-4" /> Shift templates
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
        <span className={mutedSmPlain}>{visible.length} assignments · {shifts.filter((s) => s.is_active).length} shift templates</span>
      </div>

      <div className={flexWrapGap2}>
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

      {/* Calendar tabs */}
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-card-bg)] p-1 text-sm font-medium">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors duration-150 ${active ? "bg-[var(--color-primary)] text-white shadow-sm" : "text-[var(--color-muted-fg)] hover:text-[var(--color-foreground)]"}`}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--color-muted-fg)]">
          <Loader2 className={spinner} /> Loading roster…
        </div>
      ) : (
        <>
          {tab === "list" && (
            <div className="space-y-4">
              {isAdmin && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm">
                  {selIds.length === 0 ? (
                    <>
                      <span className="font-medium text-sky-800">Bulk actions</span>
                      <button
                        type="button"
                        className="rounded-lg border border-sky-300 bg-white px-2.5 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-100"
                        onClick={() => { setSelIds(visible.map((r) => r.id)); setSelMsg(null); }}
                      >
                        Select all {visible.length}
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="font-semibold text-sky-800">{selIds.length} selected</span>
                      <button
                        type="button"
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                        onClick={() => bulkStatus("complete")}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Complete ({selIds.length})
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                        onClick={() => bulkStatus("cancel")}
                      >
                        <XCircle className="h-3.5 w-3.5" /> Cancel ({selIds.length})
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                        onClick={() => bulkStatus("delete")}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete ({selIds.length})
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-sky-300 bg-white px-2.5 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-100"
                        onClick={() => { setSelIds([]); setSelMsg(null); }}
                      >
                        Clear
                      </button>
                      {busy && <Loader2 className="h-4 w-4 animate-spin text-sky-600" />}
                    </>
                  )}
                </div>
              )}
              {selMsg && (
                <div className={`rounded-xl px-4 py-2.5 text-sm ${selMsg.kind === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                  {selMsg.text}
                </div>
              )}
              {dates.map((d) => (
                <div key={d} className="rounded-2xl border border-[var(--color-border)] bg-white">
                  <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2.5">
                    <span className="text-sm font-semibold">{fmtDayLong(d)}</span>
                    <span className="rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-xs font-medium text-[var(--color-muted-fg)]">
                      {byDate.get(d)!.length} on duty
                    </span>
                  </div>
                  <div className={divideBorder}>
                    {byDate.get(d)!.map((r) => (
                      <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                        {isAdmin && (
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]"
                            checked={selIds.includes(r.id)}
                            onChange={() => toggleSel(r.id)}
                            aria-label={`Select ${r.staff?.users?.full_name ?? "assignment"} on ${r.shift_date}`}
                          />
                        )}
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.shift?.color ?? "#94a3b8" }} />
                        <div className="min-w-[140px]">
                          <div className="font-medium">{r.staff?.users?.full_name}</div>
                          <div className={mutedXs}>{r.staff?.users?.role}{r.staff?.department ? ` · ${r.staff.department}` : ""}</div>
                        </div>
                        <div className="min-w-[120px]">
                          <div className="font-medium">{r.shift?.name ?? "—"}</div>
                          <div className={mutedXs}>
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
                  No shifts assigned in this window.
                </div>
              )}
            </div>
          )}

          {tab === "staff" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3">
                <label className={labelCls + " mb-0"}>Staff member</label>
                <select className={inputCls + " max-w-[320px]"} value={staffSel} onChange={(e) => setStaffSel(e.target.value)} aria-label="Select staff member">
                  <option value="">Select a staff member…</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>{s.users?.full_name} · {s.users?.role}{s.department ? ` · ${s.department}` : ""}</option>
                  ))}
                </select>
                {selectedStaff && (
                  <span className={mutedSmPlain}>
                    {staffRows.length} shift{staffRows.length === 1 ? "" : "s"} in this window · {staffRows.filter((r) => r.status === "completed").length} completed
                  </span>
                )}
              </div>

              {!staffSel ? (
                <div className="rounded-2xl border border-[var(--color-border)] bg-white px-4 py-12 text-center text-sm text-[var(--color-muted-fg)]">
                  Select a staff member to see their duty calendar.
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-white">
                    <div className="grid min-w-[700px] grid-cols-7 border-b border-[var(--color-border)]">
                      {TXT.map((d, i) => (
                        <div key={d} className={`px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide ${i === 0 || i === 6 ? "text-rose-400" : "text-[var(--color-muted-fg)]"}`}>{d}</div>
                      ))}
                    </div>
                    <div className="grid min-w-[700px] grid-cols-7">
                      {grid.map((c) => {
                        const dayRows = byDate.get(c.date)?.filter((r) => r.staff_id === staffSel) ?? [];
                        const today = isToday(c.date);
                        return (
                          <button
                            key={c.key}
                            type="button"
                            onClick={() => { setDayDate(c.date); setTab("day"); }}
                            title={`${c.date} — ${dayRows.length} assignment${dayRows.length === 1 ? "" : "s"}. Click to open this day.`}
                            className={`min-h-[92px] border-b border-r border-[var(--color-border)] p-1.5 text-left transition-colors duration-150 hover:bg-[var(--color-muted)] ${!c.inMonth ? "bg-[var(--color-muted)]/40 opacity-50" : ""} ${today ? "ring-2 ring-inset ring-[var(--color-primary)]" : ""}`}
                          >
                            <div className={`text-xs font-medium ${today ? "text-[var(--color-primary)]" : "text-[var(--color-muted-fg)]"}`}>{Number(c.date.slice(8))}</div>
                            <div className="mt-1 space-y-1">
                              {dayRows.slice(0, 2).map((r) => (
                                <div key={r.id} className="truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium text-white" style={{ background: r.shift?.color ?? "#64748b" }} title={r.shift?.name ?? "—"}>
                                  {r.shift?.name ?? "—"}
                                </div>
                              ))}
                              {dayRows.length > 2 && <div className="px-1 text-[11px] font-medium text-[var(--color-muted-fg)]">+{dayRows.length - 2} more</div>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[var(--color-border)] bg-white">
                    <div className="border-b border-[var(--color-border)] px-4 py-2.5 text-sm font-semibold">
                      {selectedStaff?.users?.full_name} — assignments
                    </div>
                    <div className={divideBorder}>
                      {staffRows.map((r) => (
                        <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.shift?.color ?? "#94a3b8" }} />
                          <span className="min-w-[130px] font-medium">{fmtDayLong(r.shift_date)}</span>
                          <div className="min-w-[120px]">
                            <div className="font-medium">{r.shift?.name ?? "—"}</div>
                            <div className={mutedXs}>
                              {r.shift ? `${String(r.shift.start_time).slice(0, 5)}–${String(r.shift.end_time).slice(0, 5)}` : ""}{r.ward?.name ? ` · ${r.ward.name}` : ""}
                            </div>
                          </div>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[r.status] ?? "bg-slate-100 text-slate-500"}`}>{r.status}</span>
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
                      {staffRows.length === 0 && (
                        <div className="px-4 py-8 text-center text-sm text-[var(--color-muted-fg)]">No assignments for this window.</div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {tab === "day" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3">
                <div>
                  <div className="text-base font-semibold">{fmtDayLong(dayDate)}</div>
                  <div className={mutedXs}>Staff on duty this day</div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="rounded-full bg-sky-50 px-3 py-1 font-medium text-sky-700">{daySorted.length} on duty</span>
                  <span className="rounded-full bg-[var(--color-muted)] px-3 py-1 text-[var(--color-muted-fg)]">{new Set(daySorted.map((r) => r.shift_id)).size} shifts</span>
                </div>
              </div>
              {daySorted.length === 0 ? (
                <div className="rounded-2xl border border-[var(--color-border)] bg-white px-4 py-12 text-center text-sm text-[var(--color-muted-fg)]">
                  No staff scheduled on this day.
                </div>
              ) : (
                <div className="space-y-3">
                  {daySorted.map((r) => (
                    <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm shadow-[var(--shadow-sm)]">
                      <span className="h-9 w-1.5 rounded-full" style={{ background: r.shift?.color ?? "#94a3b8" }} />
                      <div className="min-w-[150px]">
                        <div className="font-medium">{r.staff?.users?.full_name}</div>
                        <div className={mutedXs}>{r.staff?.users?.role}{r.staff?.department ? ` · ${r.staff.department}` : ""}</div>
                      </div>
                      <div className="min-w-[130px]">
                        <div className="font-medium">{r.shift?.name ?? "—"}</div>
                        <div className={mutedXs}>
                          {r.shift ? `${String(r.shift.start_time).slice(0, 5)}–${String(r.shift.end_time).slice(0, 5)}` : ""}{r.ward?.name ? ` · ${r.ward.name}` : ""}
                        </div>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[r.status] ?? "bg-slate-100 text-slate-500"}`}>{r.status}</span>
                      {r.notes && <span className="max-w-[200px] truncate text-xs text-[var(--color-muted-fg)]">{r.notes}</span>}
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
              )}
            </div>
          )}

          {tab === "week" && (
            <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-white">
              <div className="grid min-w-[840px] grid-cols-7">
                {weekDays.map((d) => {
                  const dayRows = byDate.get(d) ?? [];
                  const today = isToday(d);
                  return (
                    <div key={d} className={`min-h-[280px] border-r border-[var(--color-border)] last:border-r-0 ${today ? "bg-sky-50/60" : ""}`}>
                      <button
                        type="button"
                        onClick={() => { setDayDate(d); setTab("day"); }}
                        className={`w-full border-b border-[var(--color-border)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-muted)] ${today ? "bg-[var(--color-primary)] text-white" : ""}`}
                      >
                        <div className={`text-xs font-semibold uppercase tracking-wide ${today ? "text-white/80" : "text-[var(--color-muted-fg)]"}`}>{TXT[parseLocal(d).getDay()]}</div>
                        <div className={`text-lg font-bold ${today ? "text-white" : "text-[var(--color-foreground)]"}`}>{Number(d.slice(8))}</div>
                        <div className={`text-[11px] ${today ? "text-white/80" : "text-[var(--color-muted-fg)]"}`}>{dayRows.length} on duty</div>
                      </button>
                      <div className="max-h-[420px] space-y-1.5 overflow-y-auto p-2">
                        {dayRows.map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => { setDayDate(d); setTab("day"); }}
                            className="block w-full rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-left transition-colors hover:border-[var(--color-primary)]"
                            title={`${r.staff?.users?.full_name} · ${r.shift?.name ?? "—"} · ${r.status}`}
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.shift?.color ?? "#94a3b8" }} />
                              <span className="truncate text-xs font-medium text-[var(--color-foreground)]">{r.staff?.users?.full_name}</span>
                            </div>
                            <div className="ml-3.5 flex items-center gap-1.5 text-[11px] text-[var(--color-muted-fg)]">
                              <span>{r.shift?.name ?? "—"}</span>
                              {r.shift && <span>· {String(r.shift.start_time).slice(0, 5)}</span>}
                              <span className={`rounded-full px-1.5 ${STATUS_CLASS[r.status] ?? "bg-slate-100 text-slate-500"}`}>{r.status}</span>
                            </div>
                          </button>
                        ))}
                        {dayRows.length === 0 && <div className="px-2 py-4 text-center text-xs text-[var(--color-muted-fg)]">No duty</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "month" && (
            <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-white">
              <div className="grid min-w-[840px] grid-cols-7 border-b border-[var(--color-border)]">
                {TXT.map((d, i) => (
                  <div key={d} className={`px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide ${i === 0 || i === 6 ? "text-rose-400" : "text-[var(--color-muted-fg)]"}`}>{d}</div>
                ))}
              </div>
              <div className="grid min-w-[840px] grid-cols-7">
                {grid.map((c) => {
                  const dayRows = byDate.get(c.date) ?? [];
                  const today = isToday(c.date);
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => { setDayDate(c.date); setTab("day"); }}
                      title={`${c.date} — ${dayRows.length} staff on duty. Click to open this day.`}
                      className={`min-h-[104px] border-b border-r border-[var(--color-border)] p-1.5 text-left transition-colors duration-150 hover:bg-[var(--color-muted)] ${!c.inMonth ? "bg-[var(--color-muted)]/40 opacity-50" : ""} ${today ? "ring-2 ring-inset ring-[var(--color-primary)]" : ""}`}
                    >
                      <div className={flexBetween}>
                        <span className={`text-xs font-semibold ${today ? "text-[var(--color-primary)]" : "text-[var(--color-muted-fg)]"}`}>{Number(c.date.slice(8))}</span>
                        {dayRows.length > 0 && (
                          <span className="rounded-full bg-[var(--color-primary)] px-1.5 py-0.5 text-[10px] font-bold text-white">{dayRows.length}</span>
                        )}
                      </div>
                      <div className="mt-1 space-y-1">
                        {dayRows.slice(0, 3).map((r) => (
                          <div key={r.id} className="flex items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium" style={{ background: `${r.shift?.color ?? "#64748b"}1a`, color: r.shift?.color ?? "#475569" }} title={`${r.staff?.users?.full_name} · ${r.shift?.name ?? "—"} · ${r.status}`}>
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: r.shift?.color ?? "#94a3b8" }} />
                            <span className="truncate">{r.staff?.users?.full_name}</span>
                          </div>
                        ))}
                        {dayRows.length > 3 && <div className="px-1 text-[11px] font-medium text-[var(--color-muted-fg)]">+{dayRows.length - 3} more…</div>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}


      {showAssign && (
        <AssignShiftModal
          setShowAssign={setShowAssign} staffId={staffId} setStaffId={setStaffId}
          staff={staff} shiftId={shiftId} setShiftId={setShiftId}
          shifts={shifts} shiftDate={shiftDate} setShiftDate={setShiftDate}
          notes={notes} setNotes={setNotes} error={error} busy={busy}
          assign={assign}
        />
      )}

      {showBulk && (
        <BulkAssignModal
          setShowBulk={setShowBulk} setBulkMsg={setBulkMsg}
          bulkShiftId={bulkShiftId} setBulkShiftId={setBulkShiftId}
          shifts={shifts} bulkFrom={bulkFrom} setBulkFrom={setBulkFrom}
          bulkTo={bulkTo} setBulkTo={setBulkTo} bulkNotes={bulkNotes} setBulkNotes={setBulkNotes}
          bulkDept={bulkDept} setBulkDept={setBulkDept} bulkRole={bulkRole} setBulkRole={setBulkRole}
          bulkStaffIds={bulkStaffIds} setBulkStaffIds={setBulkStaffIds}
          bulkMsg={bulkMsg} busy={busy} bulkAssign={bulkAssign} staff={staff}
        />
      )}

      {showShift && (
        <ShiftFormModal
          setShowShift={setShowShift} editingShift={editingShift}
          shiftName={shiftName} setShiftName={setShiftName}
          shiftStart={shiftStart} setShiftStart={setShiftStart}
          shiftEnd={shiftEnd} setShiftEnd={setShiftEnd}
          shiftDept={shiftDept} setShiftDept={setShiftDept}
          shiftColor={shiftColor} setShiftColor={setShiftColor}
          error={error} busy={busy} createShift={createShift}
        />
      )}

      {showShifts && (
        <ShiftTemplatesModal
          setShowShifts={setShowShifts} shifts={shifts}
          openEditShift={openEditShift} deleteShift={deleteShift}
        />
      )}

    </div>
  );
}
