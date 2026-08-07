"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Loader2, Plus, X } from "lucide-react";

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";

const LEAVE_LABELS: Record<string, string> = {
  annual: "Annual",
  sick: "Sick",
  study: "Study",
  unpaid: "Unpaid",
  maternity: "Maternity",
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

function fmtDate(d: string): string {
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

export default function LeaveView() {
  const [rows, setRows] = useState<LeaveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"mine" | "all">("mine");
  const [isAdmin, setIsAdmin] = useState(false);

  const [showNew, setShowNew] = useState(false);
  const [leaveType, setLeaveType] = useState("annual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const meRes = await fetch("/api/auth/me", { cache: "no-store" });
      const me = await meRes.json();
      const role = me.data?.claims?.role;
      const admin = role === "hospital_admin" || role === "super_admin";
      setIsAdmin(admin);
      const res = await fetch(`/api/staff/leave?pageSize=100${tab === "all" ? "&status=" : ""}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load leave requests");
      setRows(body.data ?? []);
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Leave</h1>
          <p className="mt-1 text-sm text-[var(--color-muted-fg)]">Request and manage staff leave.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)]"
        >
          <Plus size={15} /> Request Leave
        </button>
      </div>

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
        <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
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
          <p className="mt-3 text-sm font-medium text-[var(--color-foreground)]">No leave requests.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="rounded-xl border border-[var(--color-border)] bg-white px-4 py-3.5 shadow-[var(--shadow-sm)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-[var(--color-foreground)]">
                    {LEAVE_LABELS[row.leave_type] ?? row.leave_type} leave
                    {tab === "all" && row.users?.full_name ? ` · ${row.users.full_name}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--color-muted-fg)]">
                    {fmtDate(row.start_date)} → {fmtDate(row.end_date)} · {row.days ?? "—"} day(s)
                    {row.reason ? ` · ${row.reason}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
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
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[var(--color-foreground)]">Request leave</h2>
              <button type="button" onClick={() => setShowNew(false)} className="focus-ring rounded-lg p-2 text-[var(--color-muted-fg)] hover:bg-slate-100" aria-label="Close">
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