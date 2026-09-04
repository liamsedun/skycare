"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Loader2, Plus, X } from "lucide-react";
import ImportExportMenu from "@/components/ui/import-export-menu";
import type { ImportResult } from "@/components/ui/csv-import-modal";
import { dateStamp, downloadCsv, printTable } from "@/lib/export";
import { inDateRange } from "@/lib/daterange";
import { errorBanner, cardTitle, flexBetween, mutedSm, flexGap2, mutedXsMt, sectionTitle, mutedSmPlain, pageTitle, ghostIconBtn } from "@/lib/ui-constants";
import DateRangeBar from "@/components/filters/date-range-bar";

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";

const LEAVE_LABELS: Record<string, string> = {
  annual: "Annual",
  sick: "Sick",
  study: "Study",
  unpaid: "Unpaid",
  maternity: "Maternity",
  emergency: "Emergency",
  paternity: "Paternity",
};

const STATUS_CLASS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-rose-100 text-rose-700",
  cancelled: "bg-slate-100 text-slate-500",
};

interface LeaveRow {
  id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days: number | null;
  reason: string | null;
  status: string;
  created_at: string;
  users: { id: string; full_name: string; role: string } | null;
}

interface BalanceRow {
  id: string;
  leave_type: string;
  leave_year: number;
  entitled_days: number;
  used_days: number;
}

function fmtDate(d: string): string {
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

export default function LeaveView() {
  const [rows, setRows] = useState<LeaveRow[]>([]);
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"mine" | "all">("mine");
  const [isAdmin, setIsAdmin] = useState(false);

  const [showNew, setShowNew] = useState(false);
  const [leaveType, setLeaveType] = useState("annual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const meRes = await fetch("/api/auth/me", { cache: "no-store" });
      const me = await meRes.json();
      const role = me.data?.claims?.role;
      const admin = role === "hospital_admin";
      setIsAdmin(admin);
      const res = await fetch(`/api/staff/leave?pageSize=100${tab === "all" ? "&status=" : ""}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load leave requests");
      setRows(body.data ?? []);
      const balRes = await fetch(`/api/hr/leave-balances?year=${new Date().getFullYear()}&staff_id=me`, { cache: "no-store" });
      const balBody = await balRes.json();
      if (balRes.ok) setBalances(balBody.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load leave requests");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!startDate || !endDate) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaveType, startDate, endDate, reason: reason.trim() || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to submit request");
      setShowNew(false);
      setStartDate("");
      setEndDate("");
      setReason("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit request");
    } finally {
      setBusy(false);
    }
  }

  async function review(id: string, status: "approved" | "rejected") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/staff/leave/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to update request");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update request");
    } finally {
      setBusy(false);
    }
  }

  async function cancelReq(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/staff/leave/${id}`, { method: "DELETE" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  const visibleRows = rows.filter((r) => inDateRange(r.start_date, from, to));

  const LEAVE_EXPORT_COLUMNS = [
    "staff",
    "leave_type",
    "start_date",
    "end_date",
    "days",
    "reason",
    "status",
  ];

  function leaveRows() {
    return rows.map((r) => [
      r.users?.full_name ?? "",
      LEAVE_LABELS[r.leave_type] ?? r.leave_type,
      r.start_date,
      r.end_date,
      r.days ?? "",
      r.reason ?? "",
      r.status,
    ]);
  }

  function exportLeaveCsv() {
    if (rows.length === 0) {
      alert("Nothing to export — there are no leave requests yet.");
      return;
    }
    downloadCsv(`leave-requests-${dateStamp()}.csv`, LEAVE_EXPORT_COLUMNS, leaveRows());
  }

  function exportLeavePdf() {
    if (rows.length === 0) {
      alert("Nothing to export — there are no leave requests yet.");
      return;
    }
    printTable("Leave Requests", LEAVE_EXPORT_COLUMNS, leaveRows());
  }

  const LEAVE_IMPORT_COLUMNS = ["leave_type", "start_date", "end_date", "reason"];

  async function importLeave(importRows: string[][]): Promise<ImportResult> {
    const errors: string[] = [];
    let created = 0;
    for (let i = 0; i < importRows.length; i++) {
      const r = importRows[i];
      const rowNo = i + 2;
      const leaveType = r[0]?.trim() ?? "";
      const startDate = r[1]?.trim() ?? "";
      const endDate = r[2]?.trim() ?? "";
      if (!leaveType || !startDate || !endDate) {
        errors.push(`Row ${rowNo}: leave_type, start_date and end_date are required`);
        continue;
      }
      try {
        const res = await fetch("/api/staff/leave", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leaveType,
            startDate,
            endDate,
            reason: r[3]?.trim() || undefined,
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to submit request");
        created++;
      } catch (e) {
        errors.push(
          `Row ${rowNo}: ${e instanceof Error ? e.message : "Failed to submit request"}`
        );
      }
    }
    return { created, failed: errors.length, errors };
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className={pageTitle}>Leave</h1>
          <p className={mutedSm}>Request and manage staff leave.</p>
        </div>
        <DateRangeBar
          from={from}
          to={to}
          onFromChange={setFrom}
          onToChange={setTo}
          onClear={() => { setFrom(""); setTo(""); }}
        />
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)]"
        >
          <Plus size={15} /> Request Leave
        </button>
        <ImportExportMenu
          entityLabel="Leave Requests"
          exportCsv={exportLeaveCsv}
          exportPdf={exportLeavePdf}
          importColumns={LEAVE_IMPORT_COLUMNS}
          importSample={[["annual", "2026-09-01", "2026-09-05", "Family event"]]}
          templateFilename="leave-import-template.csv"
          onImport={importLeave}
          onImported={() => load()}
        />
      </div>

      {!loading && (
        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase text-[var(--color-muted-fg)]">My leave balances · {new Date().getFullYear()}</h2>
            {balances.length > 0 && (
              <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-800">
                {balances.reduce((acc, b) => acc + Math.max(0, Number(b.entitled_days ?? 0) - Number(b.used_days ?? 0)), 0)} day(s) remaining
              </span>
            )}
          </div>
          {balances.length === 0 ? (
            <p className={mutedSmPlain}>No leave balances yet — they appear here once HR sets your entitlements.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
              {balances.map((b) => {
                const ent = Number(b.entitled_days ?? 0);
                const used = Number(b.used_days ?? 0);
                const rem = Math.max(0, ent - used);
                const tile = rem > 0 ? "border-emerald-200 bg-emerald-50" : ent > 0 ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50";
                const num = rem > 0 ? "text-emerald-700" : ent > 0 ? "text-amber-700" : "text-slate-500";
                return (
                  <div key={b.id} className={`rounded-xl border p-3 ${tile}`}>
                    <div className="text-xs font-medium text-[var(--color-muted-fg)]">{LEAVE_LABELS[b.leave_type] ?? b.leave_type}</div>
                    <div className={`mt-1 text-2xl font-bold ${num}`}>{rem}</div>
                    <div className="mt-0.5 text-[11px] text-[var(--color-muted-fg)]">{used} used · {ent} entitled</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {isAdmin && (
        <div className="flex gap-2 border-b border-[var(--color-border)]">
          {(["mine", "all"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`focus-ring -mb-px border-b-2 px-3.5 py-2.5 text-sm font-medium ${tab === t ? "border-[var(--color-primary)] text-[var(--color-primary-dark)]" : "border-transparent text-[var(--color-muted-fg)] hover:text-[var(--color-foreground)]"}`}
            >
              {t === "mine" ? "My requests" : "All requests"}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className={errorBanner}>
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={22} aria-hidden="true" className="animate-spin text-[var(--color-muted-fg)]" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-white py-16 text-center shadow-[var(--shadow-sm)]">
          <CalendarDays size={40} aria-hidden="true" className="mx-auto text-[var(--color-muted-fg)]" />
          <p className={sectionTitle}>No leave requests.</p>
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-white py-16 text-center shadow-[var(--shadow-sm)]">
          <p className="text-sm font-medium text-[var(--color-foreground)]">
            No leave requests match the current date range.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibleRows.map((row) => (
            <div key={row.id} className="rounded-xl border border-[var(--color-border)] bg-white px-4 py-3.5 shadow-[var(--shadow-sm)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className={cardTitle}>
                    {LEAVE_LABELS[row.leave_type] ?? row.leave_type} leave
                    {tab === "all" && row.users?.full_name ? ` · ${row.users.full_name}` : ""}
                  </p>
                  <p className={mutedXsMt}>
                    {fmtDate(row.start_date)} → {fmtDate(row.end_date)} · {row.days ?? "—"} day(s)
                    {row.reason ? ` · ${row.reason}` : ""}
                  </p>
                </div>
                <div className={flexGap2}>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${STATUS_CLASS[row.status] ?? STATUS_CLASS.pending}`}>
                    {row.status}
                  </span>
                  {tab === "all" && row.status === "pending" && (
                    <>
                      <button
                        type="button"
                        onClick={() => review(row.id, "approved")}
                        disabled={busy}
                        className="focus-ring rounded-lg bg-emerald-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => review(row.id, "rejected")}
                        disabled={busy}
                        className="focus-ring rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-muted-fg)] hover:bg-slate-50 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {tab === "mine" && row.status === "pending" && (
                    <button
                      type="button"
                      onClick={() => cancelReq(row.id)}
                      disabled={busy}
                      className="focus-ring inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-muted-fg)] hover:bg-slate-50 disabled:opacity-50"
                    >
                      <X size={12} /> Cancel Request
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Request leave">
          <form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-xl)]">
            <div className={flexBetween}>
              <h2 className="text-lg font-bold text-[var(--color-foreground)]">Request leave</h2>
              <button type="button" onClick={() => setShowNew(false)} className={ghostIconBtn} aria-label="Close">
                ✕
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className={labelCls} htmlFor="lv-type">Leave type</label>
                <select id="lv-type" className={inputCls} value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
                  {Object.entries(LEAVE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls} htmlFor="lv-start">Start date</label>
                  <input id="lv-start" type="date" className={inputCls} value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
                </div>
                <div>
                  <label className={labelCls} htmlFor="lv-end">End date</label>
                  <input id="lv-end" type="date" className={inputCls} value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
                </div>
              </div>
              <div>
                <label className={labelCls} htmlFor="lv-reason">Reason</label>
                <textarea id="lv-reason" rows={3} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional" />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setShowNew(false)} className="focus-ring rounded-lg border border-[var(--color-border)] px-3.5 py-2 text-sm font-medium text-[var(--color-foreground)] hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={busy} className="focus-ring rounded-lg bg-[var(--color-primary)] px-3.5 py-2 text-sm font-medium text-white disabled:opacity-60">
                {busy ? "Submitting…" : "Submit request"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}