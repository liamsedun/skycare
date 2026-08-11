"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Play, Wallet } from "lucide-react";
import ImportExportMenu from "@/components/ui/import-export-menu";
import type { ImportResult } from "@/components/ui/csv-import-modal";
import { downloadCsv, printTable } from "@/lib/export";

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";

interface PayRow {
  id: string;
  staff_id: string;
  pay_period: string;
  base_salary: number;
  allowances: number;
  deductions: number;
  overtime_pay: number;
  bonus: number;
  net_salary: number;
  worked_days: number;
  absent_days: number;
  overtime_hours: number;
  status: string;
  generated_at: string;
  staff: { staff_number: string; users: { full_name: string; role: string; email: string } | null } | null;
}

interface Payslip extends PayRow {
  lines: Array<{ id: string; line_type: string; label: string; amount: number }>;
}

const STATUS_CLASS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  approved: "bg-sky-100 text-sky-700",
  paid: "bg-emerald-100 text-emerald-700",
};

const fmtN = (n: number) => `₦${(n ?? 0).toLocaleString()}`;

export default function HrPayrollView() {
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [rows, setRows] = useState<PayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const [slip, setSlip] = useState<Payslip | null>(null);
  const [editing, setEditing] = useState<Payslip | null>(null);
  const [editAllow, setEditAllow] = useState(0);
  const [editBonus, setEditBonus] = useState(0);
  const [editDed, setEditDed] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const meRes = await fetch("/api/auth/me", { cache: "no-store" });
      const me = await meRes.json();
      setIsAdmin(["hospital_admin", "hr_officer", "super_admin", "accountant"].includes(me.data?.claims?.role));
      const res = await fetch(`/api/hr/payroll?period=${period}&pageSize=200`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load payroll");
      setRows(body.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load payroll");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  async function runPayroll() {
    setRunning(true);
    setError(null);
    setRunMsg(null);
    try {
      const res = await fetch("/api/hr/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to run payroll");
      setRunMsg(`Generated ${body.data?.generated} record(s), net ₦${(body.data?.total_net ?? 0).toLocaleString()}. ${body.data?.skipped?.length ? `${body.data.skipped.length} skipped (no attendance data).` : ""}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to run payroll");
    } finally {
      setRunning(false);
    }
  }

  async function openSlip(id: string) {
    try {
      const res = await fetch(`/api/hr/payroll/${id}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load payslip");
      setSlip(body.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load payslip");
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setRunning(true);
    try {
      const res = await fetch(`/api/hr/payroll/${editing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowances: editAllow, bonus: editBonus, deductions: editDed }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to save");
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setRunning(false);
    }
  }

  async function setStatus(id: string, status: string) {
    try {
      const res = await fetch(`/api/hr/payroll/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to update");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    }
  }

  const totals = rows.reduce(
    (acc, r) => {
      acc.net += r.net_salary;
      acc.base += r.base_salary;
      acc.ot += r.overtime_pay;
      acc.ded += r.deductions;
      return acc;
    },
    { net: 0, base: 0, ot: 0, ded: 0 }
  );

  const PAYROLL_EXPORT_COLUMNS = [
    "staff_number",
    "full_name",
    "role",
    "pay_period",
    "base_salary",
    "allowances",
    "bonus",
    "overtime_pay",
    "deductions",
    "net_salary",
    "worked_days",
    "absent_days",
    "overtime_hours",
    "status",
  ];

  function payrollRows() {
    return rows.map((r) => [
      r.staff?.staff_number ?? "",
      r.staff?.users?.full_name ?? "",
      r.staff?.users?.role ?? "",
      r.pay_period,
      r.base_salary,
      r.allowances,
      r.bonus,
      r.overtime_pay,
      r.deductions,
      r.net_salary,
      r.worked_days,
      r.absent_days,
      r.overtime_hours,
      r.status,
    ]);
  }

  function exportPayrollCsv() {
    if (rows.length === 0) {
      alert("Nothing to export — there are no payroll records for this period.");
      return;
    }
    downloadCsv(`payroll-${period}.csv`, PAYROLL_EXPORT_COLUMNS, payrollRows());
  }

  function exportPayrollPdf() {
    if (rows.length === 0) {
      alert("Nothing to export — there are no payroll records for this period.");
      return;
    }
    printTable(`Payroll — ${period}`, PAYROLL_EXPORT_COLUMNS, payrollRows());
  }

  async function importPayroll(): Promise<ImportResult> {
    return {
      created: 0,
      failed: 0,
      errors: ["Payroll is generated by the system and cannot be imported."],
    };
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input type="month" className={inputCls + " max-w-[180px]"} value={period} onChange={(e) => setPeriod(e.target.value)} />
        {isAdmin && (
          <>
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50" onClick={runPayroll} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run payroll
            </button>
            <ImportExportMenu
              entityLabel="Payroll"
              exportCsv={exportPayrollCsv}
              exportPdf={exportPayrollPdf}
              importColumns={PAYROLL_EXPORT_COLUMNS}
              templateFilename="payroll-import-template.csv"
              onImport={importPayroll}
              onImported={() => load()}
            />
          </>
        )}
        {runMsg && <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">{runMsg}</span>}
      </div>

      {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
          <div className="flex items-center gap-2 text-sm text-[var(--color-muted-fg)]"><Wallet className="h-4 w-4" /> Records</div>
          <div className="mt-1 text-xl font-bold">{rows.length}</div>
        </div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
          <div className="text-sm text-[var(--color-muted-fg)]">Gross</div>
          <div className="mt-1 text-xl font-bold">{fmtN(totals.base + totals.ot)}</div>
        </div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
          <div className="text-sm text-[var(--color-muted-fg)]">Overtime</div>
          <div className="mt-1 text-xl font-bold">{fmtN(totals.ot)}</div>
        </div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
          <div className="text-sm text-[var(--color-muted-fg)]">Net payable</div>
          <div className="mt-1 text-xl font-bold text-emerald-600">{fmtN(totals.net)}</div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--color-border)] text-xs uppercase text-[var(--color-muted-fg)]">
            <tr>
              <th className="px-4 py-3">Staff</th>
              <th className="px-4 py-3">Base</th>
              <th className="px-4 py-3">OT</th>
              <th className="px-4 py-3">Deductions</th>
              <th className="px-4 py-3">Net</th>
              <th className="px-4 py-3">Days (w/a)</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3">
                  <div className="font-medium">{r.staff?.users?.full_name}</div>
                  <div className="text-xs text-[var(--color-muted-fg)]">{r.staff?.users?.role} · {r.staff?.staff_number}</div>
                </td>
                <td className="px-4 py-3">{fmtN(r.base_salary)}</td>
                <td className="px-4 py-3">{fmtN(r.overtime_pay)}</td>
                <td className="px-4 py-3 text-rose-600">−{fmtN(r.deductions)}</td>
                <td className="px-4 py-3 font-semibold">{fmtN(r.net_salary)}</td>
                <td className="px-4 py-3">{r.worked_days}/{r.absent_days}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[r.status] ?? ""}`}>{r.status}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <button className="rounded-lg border border-[var(--color-border)] px-2 py-1 text-xs font-medium hover:bg-[var(--color-muted)]" onClick={() => openSlip(r.id)}>Payslip</button>
                    {isAdmin && r.status === "draft" && (
                      <>
                        <button className="rounded-lg border border-[var(--color-border)] px-2 py-1 text-xs font-medium hover:bg-[var(--color-muted)]" onClick={() => setStatus(r.id, "approved")}>Approve</button>
                        <button
                          className="rounded-lg border border-[var(--color-border)] px-2 py-1 text-xs font-medium hover:bg-[var(--color-muted)]"
                          onClick={() => {
                            setEditing(r as Payslip);
                            setEditAllow(r.allowances);
                            setEditBonus(r.bonus);
                            setEditDed(r.deductions);
                          }}
                        >
                          Adjust
                        </button>
                      </>
                    )}
                    {isAdmin && r.status === "approved" && (
                      <button className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100" onClick={() => setStatus(r.id, "paid")}>Mark paid</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-[var(--color-muted-fg)]">No payroll records for {period}. Run payroll to generate.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {slip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSlip(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold">Payslip — {slip.pay_period}</h3>
                <p className="text-sm text-[var(--color-muted-fg)]">{slip.staff?.users?.full_name} · {slip.staff?.users?.role}</p>
              </div>
              <button className="rounded-lg p-1.5 hover:bg-[var(--color-muted)]" onClick={() => setSlip(null)}>✕</button>
            </div>
            <div className="space-y-1.5 text-sm">
              {slip.lines.map((l) => (
                <div key={l.id} className="flex justify-between border-b border-[var(--color-border)] py-1.5">
                  <span>{l.label}</span>
                  <span className={l.line_type === "deduction" ? "text-rose-600" : ""}>{l.line_type === "deduction" ? "−" : ""}{fmtN(l.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between pt-2 text-base font-bold">
                <span>Net salary</span><span>{fmtN(slip.net_salary)}</span>
              </div>
            </div>
            <div className="mt-3 text-xs text-[var(--color-muted-fg)]">
              {slip.worked_days} worked · {slip.absent_days} absent · {slip.overtime_hours}h overtime · {slip.status}
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditing(null)}>
          <form className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()} onSubmit={saveEdit}>
            <h3 className="mb-4 text-lg font-semibold">Adjust {editing.staff?.users?.full_name}</h3>
            <div className="space-y-3">
              <div><label className="mb-1 block text-sm font-medium">Allowances (₦)</label>
                <input type="number" min="0" className={inputCls} value={editAllow} onChange={(e) => setEditAllow(Number(e.target.value))} /></div>
              <div><label className="mb-1 block text-sm font-medium">Bonus (₦)</label>
                <input type="number" min="0" className={inputCls} value={editBonus} onChange={(e) => setEditBonus(Number(e.target.value))} /></div>
              <div><label className="mb-1 block text-sm font-medium">Deductions (₦)</label>
                <input type="number" min="0" className={inputCls} value={editDed} onChange={(e) => setEditDed(Number(e.target.value))} /></div>
              {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
              <button type="submit" disabled={running} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
                {running && <Loader2 className="h-4 w-4 animate-spin" />} Save
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
