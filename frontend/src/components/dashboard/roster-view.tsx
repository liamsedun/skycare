"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CalendarClock,
  CalendarRange,
  Check,
  List,
  Loader2,
  Pencil,
  Plus,
  Sun,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { fmtDate, fmtTime } from "@/lib/shift-format";
import type { LucideIcon } from "lucide-react";
import ImportExportMenu from "@/components/ui/import-export-menu";
import type { ImportResult } from "@/components/ui/csv-import-modal";
import { dateStamp, downloadCsv, printTable } from "@/lib/export";
import { mutedXs, errorBanner, flexBetween, mutedSm, fgMedium, fgSemibold, sectionTitle, pageTitle, ghostIconBtn, modalBackdrop } from "@/lib/ui-constants";

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";

type RosterViewKind = "list" | "staff" | "day" | "week";

interface RosterRow {
  id: string;
  staff_id: string;
  shift_date: string;
  from_time: string;
  until_time: string;
  note: string | null;
  staff: {
    id: string;
    staff_number: string;
    department: string | null;
    users: { id: string; full_name: string; role: string } | null;
  } | null;
  users: { id: string; full_name: string; role: string } | null;
}

interface StaffOption {
  id: string;
  staff_number: string;
  department: string | null;
  user_id: string | null;
  users: { id: string; full_name: string; role: string } | null;
}

interface RosterForm {
  staffIds: string[];
  fromDate: string;
  toDate: string;
  fromTime: string;
  untilTime: string;
  note: string;
  notify: boolean;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function mondayOf(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const day = (dt.getDay() + 6) % 7;
  dt.setDate(dt.getDate() - day);
  return toISO(dt);
}

function isoAddDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return toISO(dt);
}

function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function daysBetween(from: string, to: string): number {
  if (!from || !to) return 0;
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const a = new Date(fy, fm - 1, fd).getTime();
  const b = new Date(ty, tm - 1, td).getTime();
  return Math.max(0, Math.round((b - a) / 86400000) + 1);
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export default function RosterView() {
  const searchParams = useSearchParams();
  const preselectConsumed = useRef(false);

  const [rows, setRows] = useState<RosterRow[]>([]);
  const [staffData, setStaffData] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("All");
  const [view, setView] = useState<RosterViewKind>("list");
  const [rosterFrom, setRosterFrom] = useState(() => mondayOf(todayISO()));
  const [rosterTo, setRosterTo] = useState(() => isoAddDays(mondayOf(todayISO()), 6));

  const [showSchedule, setShowSchedule] = useState(false);
  const [saving, setSaving] = useState(false);
  const emptyForm: RosterForm = {
    staffIds: [],
    fromDate: todayISO(),
    toDate: todayISO(),
    fromTime: "08:00",
    untilTime: "16:00",
    note: "",
    notify: true,
  };
  const [form, setForm] = useState<RosterForm>(emptyForm);

  const [editShift, setEditShift] = useState<RosterRow | null>(null);
  const [editNote, setEditNote] = useState("");

  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const s of staffData) if (s.department) set.add(s.department);
    return ["All", ...Array.from(set).sort()];
  }, [staffData]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const meRes = await fetch("/api/auth/me", { cache: "no-store" });
      const me = await meRes.json();
      setIsAdmin(me.data?.claims?.role === "hospital_admin");

      const params = new URLSearchParams({ from: rosterFrom, to: rosterTo });
      const [rosterRes, staffRes] = await Promise.all([
        fetch(`/api/duty-roster?${params.toString()}`, { cache: "no-store" }),
        fetch("/api/staff?pageSize=100", { cache: "no-store" }),
      ]);
      const body = await rosterRes.json();
      if (!rosterRes.ok) throw new Error(body.error ?? "Failed to load roster");
      setRows(body.data ?? []);

      if (staffRes.ok) {
        const sb = await staffRes.json();
        setStaffData(
          (sb.data ?? []).map((s: any) => ({
            id: s.id,
            staff_number: s.staff_number,
            department: s.department,
            user_id: s.user_id,
            users: s.users ?? null,
          }))
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load roster");
    } finally {
      setLoading(false);
    }
  }, [rosterFrom, rosterTo]);

  useEffect(() => {
    load();
  }, [load]);

  // Preselect a staff member when arriving from the staff page (?staff=<id>).
  useEffect(() => {
    const preselect = searchParams.get("staff");
    if (preselect && !preselectConsumed.current && staffData.length > 0) {
      preselectConsumed.current = true;
      if (staffData.some((s) => s.id === preselect)) {
        setForm((f) => ({ ...f, staffIds: [preselect] }));
        setShowSchedule(true);
      }
    }
  }, [searchParams, staffData]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const name = r.staff?.users?.full_name ?? r.users?.full_name ?? "";
      if (q && !name.toLowerCase().includes(q) && !(r.staff?.staff_number ?? "").toLowerCase().includes(q)) {
        return false;
      }
      if (dept !== "All" && (r.staff?.department ?? null) !== dept) {
        return false;
      }
      return true;
    });
  }, [rows, search, dept]);

  const byStaff = useMemo(() => {
    const map = new Map<string, RosterRow[]>();
    for (const r of filtered) {
      const key = r.staff?.id ?? r.staff_id ?? "unknown";
      const list = map.get(key);
      if (list) list.push(r);
      else map.set(key, [r]);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const byDay = useMemo(() => {
    const map = new Map<string, RosterRow[]>();
    for (const r of filtered) {
      const list = map.get(r.shift_date);
      if (list) list.push(r);
      else map.set(r.shift_date, [r]);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const byWeek = useMemo(() => {
    const map = new Map<string, RosterRow[]>();
    for (const r of filtered) {
      const monday = mondayOf(r.shift_date);
      const list = map.get(monday);
      if (list) list.push(r);
      else map.set(monday, [r]);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const formDays = daysBetween(form.fromDate, form.toDate);
  const totalShifts = formDays * form.staffIds.length;

  const toggleStaff = (id: string) => {
    setForm((f) => ({
      ...f,
      staffIds: f.staffIds.includes(id) ? f.staffIds.filter((x) => x !== id) : [...f.staffIds, id],
    }));
  };

  async function saveSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (form.staffIds.length === 0) {
      setError("Select at least one staff member to schedule.");
      return;
    }
    if (!form.fromDate || !form.toDate) {
      setError("Pick a From and To date.");
      return;
    }
    if (form.toDate < form.fromDate) {
      setError("The 'To' date cannot be before the 'From' date.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const entries = [];
      for (const sid of form.staffIds) {
        const days = daysBetween(form.fromDate, form.toDate);
        for (let i = 0; i < days; i++) {
          entries.push({
            staffId: sid,
            shiftDate: isoAddDays(form.fromDate, i),
            fromTime: form.fromTime,
            untilTime: form.untilTime,
            note: form.note.trim() || undefined,
          });
        }
      }
      const res = await fetch("/api/duty-roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries, notify: form.notify }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to save duty schedule");
      setShowSchedule(false);
      setForm((f) => ({ ...f, staffIds: [], note: "" }));
      setFlash(
        `Duty schedule saved — ${body.count ?? entries.length} shift(s) assigned, ${
          body.notified ?? 0
        } staff notified.`
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save duty schedule");
    } finally {
      setSaving(false);
    }
  }

  function openEdit(r: RosterRow) {
    setEditShift(r);
    setEditNote(r.note ?? "");
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editShift) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        shiftDate: editShift.shift_date,
        fromTime: editShift.from_time,
        untilTime: editShift.until_time,
        note: editNote,
        notify: true,
      };
      const res = await fetch(`/api/duty-roster/${editShift.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to update shift");
      setEditShift(null);
      setFlash("Shift updated.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update shift");
    } finally {
      setSaving(false);
    }
  }

  async function removeShift(id: string) {
    if (!confirm("Remove this shift from the duty roster?")) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/duty-roster/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to remove shift");
      setFlash("Shift removed.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove shift");
    } finally {
      setSaving(false);
    }
  }

  const shiftName = (r: RosterRow) => r.staff?.users?.full_name ?? r.users?.full_name ?? "Unknown staff";
  const shiftDept = (r: RosterRow) => r.staff?.department ?? null;
  const shiftInfo = (r: RosterRow) => `FROM ${fmtTime(r.from_time)} UNTIL ${fmtTime(r.until_time)}`;

  const ROSTER_EXPORT_COLUMNS = [
    "shift_date",
    "staff",
    "department",
    "from_time",
    "until_time",
    "note",
  ];

  function rosterExportRows() {
    return rows.map((r) => [
      r.shift_date,
      shiftName(r),
      shiftDept(r) ?? "",
      r.from_time,
      r.until_time,
      r.note ?? "",
    ]);
  }

  function exportRosterCsv() {
    if (rows.length === 0) {
      alert("Nothing to export — there are no shifts in this range.");
      return;
    }
    downloadCsv(`duty-roster-${dateStamp()}.csv`, ROSTER_EXPORT_COLUMNS, rosterExportRows());
  }

  function exportRosterPdf() {
    if (rows.length === 0) {
      alert("Nothing to export — there are no shifts in this range.");
      return;
    }
    printTable("Duty Roster", ROSTER_EXPORT_COLUMNS, rosterExportRows());
  }

  const ROSTER_IMPORT_COLUMNS = ["staffId", "shiftDate", "fromTime", "untilTime", "note"];

  async function importRoster(importRows: string[][]): Promise<ImportResult> {
    const errors: string[] = [];
    let created = 0;
    for (let i = 0; i < importRows.length; i++) {
      const r = importRows[i];
      const rowNo = i + 2;
      const staffId = r[0]?.trim() ?? "";
      const shiftDate = r[1]?.trim() ?? "";
      const fromTime = r[2]?.trim() ?? "";
      const untilTime = r[3]?.trim() ?? "";
      if (!staffId || !shiftDate || !fromTime || !untilTime) {
        errors.push(`Row ${rowNo}: staffId, shiftDate, fromTime and untilTime are required`);
        continue;
      }
      try {
        const res = await fetch("/api/duty-roster", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entries: [
              {
                staffId,
                shiftDate,
                fromTime,
                untilTime,
                note: r[4]?.trim() || undefined,
              },
            ],
            notify: false,
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to save shift");
        created++;
      } catch (e) {
        errors.push(
          `Row ${rowNo}: ${e instanceof Error ? e.message : "Failed to save shift"}`
        );
      }
    }
    return { created, failed: errors.length, errors };
  }

  const RowActions = ({ r }: { r: RosterRow }) =>
    isAdmin ? (
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={() => openEdit(r)}
          className="focus-ring rounded-lg p-1.5 text-[var(--color-muted-fg)] hover:bg-slate-100 hover:text-[var(--color-primary)]"
          aria-label={`Edit shift for ${shiftName(r)}`}
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          onClick={() => removeShift(r.id)}
          disabled={saving}
          className="focus-ring rounded-lg p-1.5 text-[var(--color-muted-fg)] hover:bg-rose-50 hover:text-[var(--color-destructive)] disabled:opacity-50"
          aria-label={`Delete shift for ${shiftName(r)}`}
        >
          <Trash2 size={14} />
        </button>
      </div>
    ) : null;

  const ShiftLine = ({ r }: { r: RosterRow }) => (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-[var(--color-muted-soft)] px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-[var(--color-foreground)]">{shiftName(r)}</p>
        <p className="text-[11px] text-[var(--color-muted-fg)]">
          {fmtDate(r.shift_date)} · {shiftInfo(r)}
          {r.note ? ` · ${r.note}` : ""}
        </p>
      </div>
      <RowActions r={r} />
    </div>
  );

  const StaffRow = ({ r }: { r: RosterRow }) => {
    const name = shiftName(r);
    return (
      <td className="px-4 py-3 align-middle">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-[10px] font-bold text-[var(--color-primary-dark)]">
            {initialsOf(name)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-[var(--color-foreground)]">{name}</p>
            {r.staff?.staff_number && (
              <p className="font-mono text-[11px] text-[var(--color-muted-fg)]">{r.staff.staff_number}</p>
            )}
          </div>
        </div>
      </td>
    );
  };

  const viewTabs: { key: RosterViewKind; label: string; icon: LucideIcon }[] = [
    { key: "list", label: "List", icon: List },
    { key: "staff", label: "Per Staff", icon: Users },
    { key: "day", label: "Per Day", icon: Sun },
    { key: "week", label: "Per Week", icon: CalendarRange },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className={pageTitle}>
            Duty Roster
          </h1>
          <p className={mutedSm}>
            Schedule staff for duty across the week. Notifications + Internal Mail are sent automatically.
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setForm((f) => ({
                ...f,
                staffIds: staffData.map((s) => s.id),
                fromDate: todayISO(),
                toDate: todayISO(),
              }));
              setShowSchedule(true);
            }}
            className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)]"
          >
            <CalendarClock size={16} aria-hidden="true" /> Schedule Duty
          </button>
        )}
        <ImportExportMenu
          entityLabel="Roster"
          exportCsv={exportRosterCsv}
          exportPdf={exportRosterPdf}
          importColumns={ROSTER_IMPORT_COLUMNS}
          importSample={[["<staff_id>", "2026-09-01", "08:00", "16:00", "Ward A"]]}
          templateFilename="duty-roster-import-template.csv"
          onImport={importRoster}
          onImported={() => load()}
        />
      </div>

      {error && (
        <p role="alert" className={errorBanner}>
          {error}
        </p>
      )}
      {flash && (
        <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
          {flash}
        </p>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-52 flex-1 basis-48">
          <label className={labelCls} htmlFor="rf-search">Filter by staff name…</label>
          <input
            id="rf-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search staff…"
            className={inputCls}
          />
        </div>
        <div className="min-w-40">
          <label className={labelCls} htmlFor="rf-dept">Department</label>
          <select id="rf-dept" className={inputCls} value={dept} onChange={(e) => setDept(e.target.value)}>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="rf-from">From</label>
          <input id="rf-from" type="date" className={inputCls} value={rosterFrom} onChange={(e) => setRosterFrom(e.target.value)} />
        </div>
        <div>
          <label className={labelCls} htmlFor="rf-to">To</label>
          <input id="rf-to" type="date" className={inputCls} value={rosterTo} onChange={(e) => setRosterTo(e.target.value)} />
        </div>
        <div className="ml-auto flex h-9 items-center gap-2 text-sm text-[var(--color-muted-fg)]">
          {loading ? "Loading…" : `${filtered.length} shift(s) scheduled`}
        </div>
      </div>

      {/* View tabs */}
      <div className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-white p-1">
        {viewTabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            className={`focus-ring inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
              view === key
                ? "bg-[var(--color-primary)] text-white"
                : "text-[var(--color-muted-fg)] hover:bg-[var(--color-muted-soft)] hover:text-[var(--color-foreground)]"
            }`}
          >
            <Icon size={14} aria-hidden="true" /> {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={22} aria-hidden="true" className="animate-spin text-[var(--color-muted-fg)]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-white py-16 text-center shadow-[var(--shadow-sm)]">
          <CalendarRange size={40} aria-hidden="true" className="mx-auto text-[var(--color-muted-fg)]" />
          <p className={sectionTitle}>
            No shifts scheduled in this range.
          </p>
          {isAdmin && (
            <button type="button" onClick={() => { setError(null); setForm((f) => ({ ...f, staffIds: staffData.map((s) => s.id), fromDate: todayISO(), toDate: todayISO() })); setShowSchedule(true); }} className="focus-ring mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-primary)] hover:border-[var(--color-primary)]">
              <Plus size={14} /> Schedule Duty
            </button>
          )}
        </div>
      ) : view === "list" ? (
        <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-wide text-[var(--color-muted-fg)]">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Staff</th>
                <th className="px-4 py-3 font-medium">Department</th>
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Note</th>
                {isAdmin && <th className="px-4 py-3 text-right font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-[var(--color-border)]/60 last:border-b-0 hover:bg-[var(--color-muted-soft)]/40">
                  <td className="whitespace-nowrap px-4 py-3 text-[var(--color-foreground)]">{fmtDate(r.shift_date)}</td>
                  <StaffRow r={r} />
                  <td className="px-4 py-3 text-[var(--color-muted-fg)]">{shiftDept(r) ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-[var(--color-foreground)]">{shiftInfo(r)}</td>
                  <td className="max-w-40 truncate px-4 py-3 text-[var(--color-muted-fg)]">{r.note ?? "—"}</td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <RowActions r={r} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : view === "staff" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {byStaff.map(([staffId, shifts]) => {
            const first = shifts[0];
            const name = shiftName(first);
            return (
              <div key={staffId} className="rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-sm)]">
                <div className="mb-3 flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-sm font-bold text-[var(--color-primary-dark)]">
                    {initialsOf(name)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[var(--color-foreground)]">{name}</p>
                    <p className={mutedXs}>{first.staff?.department ?? "—"}</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {shifts.map((r) => (
                    <ShiftLine key={r.id} r={r} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : view === "day" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {byDay.map(([day, shifts]) => (
            <div key={day} className="rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-sm)]">
              <p className="mb-2.5 text-sm font-semibold text-[var(--color-foreground)]">{fmtDate(day)}</p>
              <div className="space-y-1.5">
                {shifts.map((r) => (
                  <ShiftLine key={r.id} r={r} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {byWeek.map(([monday, shifts]) => (
            <div key={monday} className="rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-sm)]">
              <p className="mb-2.5 text-sm font-semibold text-[var(--color-foreground)]">
                {fmtDate(monday)} – {fmtDate(isoAddDays(monday, 6))}
              </p>
              <div className="space-y-1.5">
                {shifts.map((r) => (
                  <ShiftLine key={r.id} r={r} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Schedule Duty modal */}
      {showSchedule && (
        <div
          className={modalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-label="Schedule duty"
        >
          <form onSubmit={saveSchedule} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className={flexBetween}>
              <h2 className="flex items-center gap-2 text-lg font-bold text-[var(--color-foreground)]">
                <CalendarClock size={18} className="text-[var(--color-primary)]" /> Schedule Duty
              </h2>
              <button type="button" onClick={() => setShowSchedule(false)} className={ghostIconBtn} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <p className="mb-1 mt-3 text-sm font-medium text-[var(--color-muted-fg)]">
              Staff ({form.staffIds.length} selected)
            </p>
            <div className="max-h-44 overflow-y-auto rounded-xl border border-[var(--color-border)]">
              {staffData.map((s) => {
                const checked = form.staffIds.includes(s.id);
                const name = s.users?.full_name ?? "Unknown staff";
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleStaff(s.id)}
                    className={`flex w-full items-center gap-3 border-b border-[var(--color-border)] px-3 py-2.5 text-left transition-colors duration-150 last:border-b-0 ${
                      checked ? "bg-[var(--color-primary-soft)]" : "hover:bg-[var(--color-muted-soft)]"
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors duration-150 ${
                        checked ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white" : "border-[var(--color-border)]"
                      }`}
                    >
                      {checked && <Check size={12} aria-hidden="true" />}
                    </span>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-bold text-[var(--color-primary-dark)] shadow-sm">
                      {initialsOf(name)}
                    </span>
                    <span className="truncate text-sm font-medium text-[var(--color-foreground)]">{name}</span>
                    <span className="ml-auto text-xs capitalize text-[var(--color-muted-fg)]">{s.department ?? "—"}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex items-center gap-4 text-xs font-medium text-[var(--color-primary)]">
              <button type="button" onClick={() => setForm((f) => ({ ...f, staffIds: staffData.map((s) => s.id) }))} className="focus-ring hover:underline">
                Select All
              </button>
              <button type="button" onClick={() => setForm((f) => ({ ...f, staffIds: [] }))} className="focus-ring hover:underline">
                Clear
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls} htmlFor="sf-from">From Date</label>
                <input id="sf-from" type="date" className={inputCls} value={form.fromDate} onChange={(e) => setForm({ ...form, fromDate: e.target.value })} required />
              </div>
              <div>
                <label className={labelCls} htmlFor="sf-to">To Date</label>
                <input id="sf-to" type="date" className={inputCls} value={form.toDate} onChange={(e) => setForm({ ...form, toDate: e.target.value })} required />
              </div>
              <div>
                <label className={labelCls} htmlFor="sf-fromtime">FROM (time)</label>
                <input id="sf-fromtime" type="time" className={inputCls} value={form.fromTime} onChange={(e) => setForm({ ...form, fromTime: e.target.value })} required />
              </div>
              <div>
                <label className={labelCls} htmlFor="sf-untiltime">UNTIL (time)</label>
                <input id="sf-untiltime" type="time" className={inputCls} value={form.untilTime} onChange={(e) => setForm({ ...form, untilTime: e.target.value })} required />
              </div>
            </div>

            <div className="mt-3">
              <label className={labelCls} htmlFor="sf-note">Note (optional)</label>
              <input id="sf-note" type="text" className={inputCls} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. Ward A shift" />
            </div>

            <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-[var(--color-muted-fg)]">
              <input
                type="checkbox"
                checked={form.notify}
                onChange={(e) => setForm({ ...form, notify: e.target.checked })}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-primary)]"
              />
              <span>
                Notify staff (in-app + push + Internal Mail):{" "}
                <span className={fgMedium}>
                  &quot;DATE: {form.fromDate && form.toDate ? (formDays > 1 ? `${form.fromDate} – ${form.toDate}` : form.fromDate) : "…"}, TIME: FROM{" "}
                  {fmtTime(form.fromTime)} UNTIL {fmtTime(form.untilTime)}&quot;
                </span>
              </span>
            </label>

            <p className="mt-3 text-xs text-[var(--color-muted-fg)]">
              {totalShifts > 0 ? (
                <>
                  <span className={fgSemibold}>{totalShifts} shift(s)</span> across{" "}
                  {formDays} day(s) for {form.staffIds.length} staff member(s)
                </>
              ) : (
                "Select staff and a date range to schedule shifts."
              )}
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSchedule(false)}
                className="focus-ring rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-foreground)] transition-colors duration-200 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || totalShifts === 0}
                className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
                {saving ? "Saving…" : "Save Duty Schedule"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit shift modal */}
      {editShift && (
        <div
          className={modalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-label="Edit shift"
        >
          <form onSubmit={saveEdit} className="max-h-[92vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className={flexBetween}>
              <h2 className="flex items-center gap-2 text-lg font-bold text-[var(--color-foreground)]">
                <CalendarClock size={18} className="text-[var(--color-primary)]" /> Edit Shift
              </h2>
              <button type="button" onClick={() => setEditShift(null)} className={ghostIconBtn} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <p className={sectionTitle}>{shiftName(editShift)}</p>
            <div className="mt-3 space-y-3">
              <div>
                <label className={labelCls} htmlFor="es-date">Date</label>
                <input
                  id="es-date"
                  type="date"
                  className={inputCls}
                  value={editShift.shift_date}
                  onChange={(e) => setEditShift({ ...editShift, shift_date: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls} htmlFor="es-from">FROM (time)</label>
                  <input id="es-from" type="time" className={inputCls} value={editShift.from_time} onChange={(e) => setEditShift({ ...editShift, from_time: e.target.value })} required />
                </div>
                <div>
                  <label className={labelCls} htmlFor="es-until">UNTIL (time)</label>
                  <input id="es-until" type="time" className={inputCls} value={editShift.until_time} onChange={(e) => setEditShift({ ...editShift, until_time: e.target.value })} required />
                </div>
              </div>
              <div>
                <label className={labelCls} htmlFor="es-note">Note (optional)</label>
                <input id="es-note" type="text" className={inputCls} value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="e.g. Ward A shift" />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setEditShift(null)} className="focus-ring rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-foreground)] hover:bg-slate-50">
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
              >
                {saving && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
