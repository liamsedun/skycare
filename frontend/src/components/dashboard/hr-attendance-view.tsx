"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, Loader2, LogIn, LogOut, RefreshCw } from "lucide-react";

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";

const STATUS_CLASS: Record<string, string> = {
  present: "bg-emerald-100 text-emerald-700",
  late: "bg-amber-100 text-amber-700",
  absent: "bg-rose-100 text-rose-700",
  on_leave: "bg-slate-100 text-slate-500",
};

interface AttRow {
  id: string;
  user_id: string;
  work_date: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
  notes: string | null;
  users: { full_name: string; role: string } | null;
  staff: { id: string | null; department: string | null } | null;
}

const fmtTime = (t: string | null) =>
  t ? new Date(t).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" }) : "—";

export default function HrAttendanceView() {
  const [rows, setRows] = useState<AttRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [clocking, setClocking] = useState(false);
  const [me, setMe] = useState<{ full_name?: string; role?: string; user_id?: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const meRes = await fetch("/api/auth/me", { cache: "no-store" });
      const meBody = await meRes.json();
      const role = meBody.data?.claims?.role;
      setIsAdmin(["hospital_admin", "hr_officer", "super_admin"].includes(role));
      setMe({ full_name: meBody.data?.user?.user_metadata?.full_name ?? "", role, user_id: meBody.data?.user?.id });

      const res = await fetch(`/api/hr/attendance?date=${date}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load attendance");
      setRows(body.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load attendance");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  async function clock(action: "in" | "out") {
    setClocking(true);
    setError(null);
    try {
      const res = await fetch("/api/hr/attendance/clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Clock failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Clock failed");
    } finally {
      setClocking(false);
    }
  }

  async function markMissed() {
    setClocking(true);
    setError(null);
    try {
      const res = await fetch("/api/hr/attendance/mark-missed", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Sync failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setClocking(false);
    }
  }

  const myRow = rows.find((r) => r.user_id === me?.user_id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input type="date" className={inputCls + " max-w-[180px]"} value={date} onChange={(e) => setDate(e.target.value)} />
        {isAdmin && (
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-muted)]" onClick={markMissed} disabled={clocking}>
            <RefreshCw className={`h-4 w-4 ${clocking ? "animate-spin" : ""}`} /> Mark missed shifts
          </button>
        )}
        <span className="text-sm text-[var(--color-muted-fg)]">{rows.length} records</span>
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-lg font-semibold"><Clock className="h-5 w-5 text-[var(--color-primary)]" /> My attendance</div>
            {myRow ? (
              <p className="mt-1 text-sm text-[var(--color-muted-fg)]">
                Checked in at {fmtTime(myRow.check_in)} · checked out at {fmtTime(myRow.check_out)} ·{" "}
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[myRow.status] ?? ""}`}>{myRow.status}</span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-[var(--color-muted-fg)]">Not clocked in today.</p>
            )}
          </div>
          <div className="flex gap-2">
            {(!myRow || !myRow.check_in) && (
              <button className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50" onClick={() => clock("in")} disabled={clocking}>
                {clocking ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />} Clock in
              </button>
            )}
            {myRow?.check_in && !myRow.check_out && (
              <button className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50" onClick={() => clock("out")} disabled={clocking}>
                {clocking ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />} Clock out
              </button>
            )}
          </div>
        </div>
      </div>

      {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--color-border)] text-xs uppercase text-[var(--color-muted-fg)]">
            <tr>
              <th className="px-4 py-3">Staff</th>
              <th className="px-4 py-3">Department</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Check in</th>
              <th className="px-4 py-3">Check out</th>
              <th className="px-4 py-3">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3">
                  <div className="font-medium">{r.users?.full_name}</div>
                  <div className="text-xs text-[var(--color-muted-fg)]">{r.users?.role}</div>
                </td>
                <td className="px-4 py-3">{r.staff?.department ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[r.status] ?? "bg-slate-100 text-slate-500"}`}>{r.status}</span>
                </td>
                <td className="px-4 py-3">{fmtTime(r.check_in)}</td>
                <td className="px-4 py-3">{fmtTime(r.check_out)}</td>
                <td className="px-4 py-3 text-xs text-[var(--color-muted-fg)]">{r.notes ?? "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-[var(--color-muted-fg)]">No attendance records for this date.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
