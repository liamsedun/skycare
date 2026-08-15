"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, CheckSquare, Loader2, Play, Printer, Trash2, Wallet } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import ImportExportMenu from "@/components/ui/import-export-menu";
import type { ImportResult } from "@/components/ui/csv-import-modal";
import { downloadCsv, printTable } from "@/lib/export";
import DateRangeBar from "@/components/filters/date-range-bar";

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";

interface PayRow {
  id: string;
  staff_id: string;
  pay_period: string;
  run_number: string | null;
  pay_date: string | null;
  base_salary: number;
  allowances: number;
  deductions: number;
  overtime_pay: number;
  bonus: number;
  net_salary: number;
  paye: number;
  pension_ee: number;
  pension_employer: number;
  nhf: number;
  nhis: number;
  nhis_employer: number;
  internal_deductions_total: number;
  tax_relief: number;
  annual_gross: number;
  chargeable_income: number;
  effective_rate_pct: number;
  worked_days: number;
  absent_days: number;
  overtime_hours: number;
  status: string;
  generated_at: string;
  calc: Record<string, unknown> | null;
  staff: { staff_number: string; users: { full_name: string; role: string; email: string } | null } | null;
}

interface Payslip extends PayRow {
  lines: Array<{ id: string; line_type: string; label: string; amount: number }>;
}

interface SummaryMonth {
  month: number;
  monthName: string;
  gross: number;
  paye: number;
  pension: number;
  nhf: number;
  nhis: number;
  net: number;
  count: number;
}

const STATUS_CLASS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  approved: "bg-sky-100 text-sky-700",
  paid: "bg-emerald-100 text-emerald-700",
};

const fmtN = (n: number) => `₦${(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function endOfPeriod(period: string) {
  const [y, m] = period.split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
}

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
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showRun, setShowRun] = useState(false);
  const [payDate, setPayDate] = useState(() => endOfPeriod(new Date().toISOString().slice(0, 7)));
  const [staffOptions, setStaffOptions] = useState<Array<{ id: string; name: string; number: string }>>([]);
  const [selectedStaff, setSelectedStaff] = useState<string[] | null>(null);
  const [staffSearch, setStaffSearch] = useState("");
  const [summaryYear, setSummaryYear] = useState(() => new Date().getFullYear());
  const [summary, setSummary] = useState<{ monthlyTotals: SummaryMonth[] } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkAllow, setBulkAllow] = useState("");
  const [bulkBonus, setBulkBonus] = useState("");
  const [bulkDed, setBulkDed] = useState("");
  const [bulkOt, setBulkOt] = useState("");
  const [bulkNotes, setBulkNotes] = useState("");
  const [bulkBug, setBulkBug] = useState<string | null>(null);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

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

  const loadSummary = useCallback(async () => {
    try {
      const res = await fetch(`/api/hr/payroll/summary?year=${summaryYear}`, { cache: "no-store" });
      const body = await res.json();
      if (res.ok) setSummary(body.data ?? null);
    } catch {
      setSummary(null);
    }
  }, [summaryYear]);

  useEffect(() => {
    load();
    loadSummary();
  }, [load, loadSummary]);

  async function openRunModal() {
    setPayDate(endOfPeriod(period));
    setSelectedStaff(null);
    setStaffSearch("");
    setShowRun(true);
    setError(null);
    if (staffOptions.length === 0) {
      try {
        const res = await fetch("/api/hr/staff?pageSize=200", { cache: "no-store" });
        const body = await res.json();
        if (res.ok) setStaffOptions((body.data ?? []).map((s: { id: string; staff_number: string; users: { full_name: string } | null }) => ({ id: s.id, name: s.users?.full_name ?? s.staff_number, number: s.staff_number })));
      } catch {
        /* staff picker is optional */
      }
    }
  }

  async function runPayroll() {
    setRunning(true);
    setError(null);
    setRunMsg(null);
    try {
      const res = await fetch("/api/hr/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, payDate, staffIds: selectedStaff }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to run payroll");
      const d = body.data ?? {};
      setRunMsg(
        `${d.runNumber}: ${d.staffCount} staff — net ${fmtN(d.total_net)} · PAYE ${fmtN(d.total_paye)} · pension ${fmtN(d.total_pension)} · NHF ${fmtN(d.total_nhf)}`
      );
      setShowRun(false);
      await load();
      await loadSummary();
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
    if (status === "paid" && !confirm("Mark this payroll as paid? This posts the net amount to the ledger.")) return;
    if (status === "approved" && !confirm("Approve this payroll? It will be frozen — adjustments are locked after approval.")) return;
    try {
      const res = await fetch(`/api/hr/payroll/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to update");
      await load();
      await loadSummary();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    }
  }

  const visibleRows = rows.filter((r) => inPeriod(r.pay_date ?? r.generated_at, from, to));

  const draftRows = visibleRows.filter((r) => r.status === "draft");
  const draftIds = draftRows.map((r) => r.id);
  const selDraftIds = selected.filter((id) => draftIds.includes(id));
  const allDraftsSelected = draftIds.length > 0 && draftIds.every((id) => selected.includes(id));

  function toggleAllDrafts() {
    setSelected(allDraftsSelected ? [] : [...new Set([...selected, ...draftIds])]);
  }

  async function runBulk(action: "approve" | "delete" | "edit", payload?: Record<string, unknown>) {
    if (selDraftIds.length === 0) return;
    setBulkBug(null);
    try {
      const res = await fetch("/api/hr/payroll/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids: selDraftIds, payload }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Bulk action failed");
      const d = body.data ?? {};
      const skippedTotal = (d.skipped?.length ?? 0) + (d.errors?.length ?? 0);
      setBulkMsg(`${action === "approve" ? "Approved" : action === "delete" ? "Deleted" : "Edited"} ${d.processed} record(s)${skippedTotal > 0 ? ` — ${skippedTotal} skipped` : ""}.`);
      if ((d.skipped?.length ?? 0) > 0) setBulkBug(`Skipped: ${d.skipped.map((s: { id: string; reason: string }) => s.reason).join(", ")}`);
      setSelected([]);
      setBulkEditOpen(false);
      await load();
      await loadSummary();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk action failed");
    }
  }

  function openBulkEdit() {
    setBulkAllow("");
    setBulkBonus("");
    setBulkDed("");
    setBulkOt("");
    setBulkNotes("");
    setBulkBug(null);
    setBulkEditOpen(true);
  }

  function submitBulkEdit(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = {};
    if (bulkAllow.trim() !== "") payload.allowances = Number(bulkAllow);
    if (bulkBonus.trim() !== "") payload.bonus = Number(bulkBonus);
    if (bulkDed.trim() !== "") payload.deductions = Number(bulkDed);
    if (bulkOt.trim() !== "") payload.overtime_pay = Number(bulkOt);
    if (bulkNotes.trim() !== "") payload.notes = bulkNotes.trim();
    if (Object.keys(payload).length === 0) {
      setBulkBug("Enter at least one value to change, or leave the record untouched.");
      return;
    }
    void runBulk("edit", payload);
  }

  const totals = visibleRows.reduce(
    (acc, r) => {
      acc.net += r.net_salary;
      acc.base += r.base_salary;
      acc.paye += r.paye || 0;
      acc.pension += r.pension_ee || 0;
      acc.nhf += r.nhf || 0;
      return acc;
    },
    { net: 0, base: 0, paye: 0, pension: 0, nhf: 0 }
  );

  const PAYROLL_EXPORT_COLUMNS = [
    "run_number",
    "pay_period",
    "pay_date",
    "staff_number",
    "full_name",
    "role",
    "base_salary",
    "housing",
    "transport",
    "utilities",
    "meals",
    "other_allowances",
    "allowances",
    "overtime_pay",
    "bonus",
    "pension_ee",
    "nhis",
    "nhf",
    "paye",
    "internal_deductions",
    "deductions",
    "net_salary",
    "status",
  ];

  function payrollRows() {
    return rows.map((r) => {
      const c = (r.calc ?? {}) as Record<string, number>;
      return [
        r.run_number ?? "",
        r.pay_period,
        r.pay_date ?? "",
        r.staff?.staff_number ?? "",
        r.staff?.users?.full_name ?? "",
        r.staff?.users?.role ?? "",
        r.base_salary,
        c.housing ?? 0,
        c.transport ?? 0,
        c.utilities ?? 0,
        c.meals ?? 0,
        c.otherAllowances ?? 0,
        r.allowances,
        r.overtime_pay,
        r.bonus,
        r.pension_ee,
        r.nhis,
        r.nhf,
        r.paye,
        r.internal_deductions_total,
        r.deductions,
        r.net_salary,
        r.status,
      ];
    });
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

  function printPayslip(s: Payslip) {
    const c = (s.calc ?? {}) as Record<string, any>;
    const line = (label: string, amount: unknown, negative = false) =>
      `<tr><td>${label}</td><td class="r">${negative ? "−" : ""}${fmtN(Number(amount) || 0)}</td></tr>`;
    const bands = Array.isArray(c.bandBreakdown)
      ? c.bandBreakdown.map(
          (b: { bandName: string; taxableAmount: number; rate: number; taxAmount: number }) =>
            `<tr><td>${b.bandName}</td><td class="r">${fmtN(b.taxableAmount)}</td><td class="r">${(b.rate * 100).toFixed(0)}%</td><td class="r">${fmtN(b.taxAmount)}</td></tr>`
        ).join("")
      : "";
    const w = window.open("", "_blank", "width=820,height=1050");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>Payslip — ${s.staff?.users?.full_name ?? ""}</title>
<style>
 body{font-family:Segoe UI,Arial,sans-serif;color:#111;padding:32px;font-size:12px}
 h1{font-size:18px;margin:0} .sub{color:#555;margin-bottom:14px}
 table{width:100%;border-collapse:collapse;margin-top:8px}
 th,td{border:1px solid #ddd;padding:5px 8px;text-align:left} .r{text-align:right}
 th{background:#f1f5f9;font-size:11px;text-transform:uppercase}
 .total td{font-weight:700;background:#f8fafc}
</style></head><body>
<h1>Payslip${s.run_number ? ` — ${s.run_number}` : ""}</h1>
<div class="sub">${s.staff?.users?.full_name ?? ""} · ${s.staff?.users?.role ?? ""} · ${s.staff?.staff_number ?? ""}<br>Period ${s.pay_period}${s.pay_date ? ` · Pay date ${s.pay_date}` : ""} · Status ${s.status}</div>
<h2>Earnings</h2><table>${line("Gross salary", s.base_salary)}${line("Basic salary", c.basicSalary)}${line("Housing", c.housing)}${line("Transport", c.transport)}${line("Utilities", c.utilities)}${line("Meals", c.meals)}${line("Other allowances", c.otherAllowances)}${line("Overtime", s.overtime_pay)}${line("Bonus", s.bonus)}</table>
<h2>Statutory deductions</h2><table>${line("Pension (employee)", s.pension_ee, true)}${line("NHIS (employee)", s.nhis, true)}${line("NHF (employee)", s.nhf, true)}${line("PAYE tax", s.paye, true)}${(Array.isArray(c.internalDeductions) ? c.internalDeductions : []).map((d: { description: string; amount: number }) => line(`Internal: ${d.description}`, d.amount, true)).join("")}<tr class="total"><td>Net pay</td><td class="r">${fmtN(s.net_salary)}</td></tr></table>
<h2>Tax computation (annual)</h2><table>${line("Annual gross", c.annualGross)}${line("Annual pension", c.annualPension, true)}${line("Annual NHIS", c.annualNHIS, true)}${line("Annual NHF", c.annualNHF, true)}${line("Rent relief", c.rentRelief, true)}${line("Mortgage interest relief", c.mortgageInterestRelief, true)}${line("Life assurance relief", c.lifeAssuranceRelief, true)}</table>
<h2>Tax bands</h2><table><tr><th>Band</th><th class="r">Taxable</th><th class="r">Rate</th><th class="r">Tax</th></tr>${bands}</table>
<p style="margin-top:14px">Chargeable income ${fmtN(c.chargeableIncome)} · Annual PAYE ${fmtN(c.annualPAYE)} · Effective rate ${Number(c.effectiveRatePct ?? 0).toFixed(2)}%</p>
</body></html>`);
    w.document.close();
    w.focus();
    w.print();
  }

  const staffFiltered = useMemo(() => {
    const q = staffSearch.toLowerCase();
    return staffOptions.filter((s) => !q || s.name.toLowerCase().includes(q) || s.number.toLowerCase().includes(q));
  }, [staffOptions, staffSearch]);

  const summaryChart = (summary?.monthlyTotals ?? []).map((m) => ({
    name: m.monthName.slice(0, 3),
    Gross: m.gross,
    Net: m.net,
  }));

  const summaryAnnual = (summary?.monthlyTotals ?? []).reduce(
    (a, m) => ({ gross: a.gross + m.gross, paye: a.paye + m.paye, pension: a.pension + m.pension, nhf: a.nhf + m.nhf, net: a.net + m.net }),
    { gross: 0, paye: 0, pension: 0, nhf: 0, net: 0 }
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input type="month" className={inputCls + " max-w-[180px]"} value={period} onChange={(e) => setPeriod(e.target.value)} />
        <DateRangeBar
          from={from}
          to={to}
          onFromChange={setFrom}
          onToChange={setTo}
          onClear={() => { setFrom(""); setTo(""); }}
        />
        {isAdmin && (
          <>
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50" onClick={openRunModal} disabled={running}>
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
      {bulkBug && <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">{bulkBug}</div>}
      {bulkMsg && <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{bulkMsg}</div>}

      {isAdmin && selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm dark:border-sky-800 dark:bg-sky-950/40">
          <CheckSquare className="h-4 w-4 text-sky-600" />
          <span className="font-medium text-sky-800 dark:text-sky-200">{selDraftIds.length} of {selected.length} selected — draft records only</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              className="rounded-lg border border-emerald-300 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
              disabled={selDraftIds.length === 0}
              onClick={() => {
                if (!confirm(`Approve ${selDraftIds.length} draft record(s)? Approved records are frozen — adjustments are locked.`)) return;
                setBulkBug(null);
                void runBulk("approve");
              }}
            >
              Approve ({selDraftIds.length})
            </button>
            <button
              className="rounded-lg border border-sky-300 bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-40"
              disabled={selDraftIds.length === 0}
              onClick={() => {
                setBulkBug(null);
                openBulkEdit();
              }}
            >
              Edit ({selDraftIds.length})
            </button>
            <button
              className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-40"
              disabled={selDraftIds.length === 0}
              onClick={() => {
                if (!confirm(`Delete ${selDraftIds.length} draft record(s)? This permanently removes the records and their payroll lines.`)) return;
                setBulkBug(null);
                void runBulk("delete");
              }}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete ({selDraftIds.length})
            </button>
            <button className="rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-transparent dark:text-sky-300" onClick={() => { setSelected([]); setBulkMsg(null); setBulkBug(null); }}>
              Clear
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
          <div className="flex items-center gap-2 text-sm text-[var(--color-muted-fg)]"><Wallet className="h-4 w-4" /> Records</div>
          <div className="mt-1 text-xl font-bold">{visibleRows.length}</div>
        </div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
          <div className="text-sm text-[var(--color-muted-fg)]">Gross</div>
          <div className="mt-1 text-xl font-bold">{fmtN(totals.base)}</div>
        </div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
          <div className="text-sm text-[var(--color-muted-fg)]">PAYE</div>
          <div className="mt-1 text-xl font-bold text-sky-600">{fmtN(totals.paye)}</div>
        </div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
          <div className="text-sm text-[var(--color-muted-fg)]">Pension (EE)</div>
          <div className="mt-1 text-xl font-bold text-violet-600">{fmtN(totals.pension)}</div>
        </div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
          <div className="text-sm text-[var(--color-muted-fg)]">NHF</div>
          <div className="mt-1 text-xl font-bold text-amber-600">{fmtN(totals.nhf)}</div>
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
              {isAdmin && (
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all draft records"
                    checked={allDraftsSelected}
                    disabled={draftIds.length === 0}
                    onChange={toggleAllDrafts}
                  />
                </th>
              )}
              <th className="px-4 py-3">Staff</th>
              <th className="px-4 py-3">Gross</th>
              <th className="px-4 py-3">PAYE</th>
              <th className="px-4 py-3">Pension</th>
              <th className="px-4 py-3">Deductions</th>
              <th className="px-4 py-3">Net</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {visibleRows.map((r) => (
              <tr key={r.id}>
                {isAdmin && (
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.staff?.users?.full_name ?? r.id}`}
                      checked={selected.includes(r.id)}
                      disabled={r.status !== "draft"}
                      title={r.status !== "draft" ? "Only draft records can be bulk-processed" : undefined}
                      onChange={() =>
                        setSelected((prev) => (prev.includes(r.id) ? prev.filter((x) => x !== r.id) : [...prev, r.id]))
                      }
                    />
                  </td>
                )}
                <td className="px-4 py-3">
                  <div className="font-medium">{r.staff?.users?.full_name}</div>
                  <div className="text-xs text-[var(--color-muted-fg)]">{r.staff?.users?.role} · {r.staff?.staff_number}{r.run_number ? ` · ${r.run_number}` : ""}</div>
                </td>
                <td className="px-4 py-3">{fmtN(r.base_salary)}</td>
                <td className="px-4 py-3 text-sky-600">{fmtN(r.paye || 0)}</td>
                <td className="px-4 py-3 text-amber-600">{fmtN(r.pension_ee || 0)}</td>
                <td className="px-4 py-3 text-rose-600">−{fmtN(r.deductions)}</td>
                <td className="px-4 py-3 font-semibold">{fmtN(r.net_salary)}</td>
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
                      <>
                        <button className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100" onClick={() => setStatus(r.id, "paid")}>Mark paid</button>
                        <button className="rounded-lg border border-[var(--color-border)] px-2 py-1 text-xs font-medium hover:bg-[var(--color-muted)]" onClick={() => setStatus(r.id, "draft")}>Unapprove</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {visibleRows.length === 0 && (
              <tr><td colSpan={isAdmin ? 8 : 7} className="px-4 py-10 text-center text-sm text-[var(--color-muted-fg)]">{rows.length === 0 ? `No payroll records for ${period}. Run payroll to generate.` : "No payroll records match the current date range."}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold"><BarChart3 className="h-4 w-4 text-[var(--color-primary)]" /> Payroll summary · {summaryYear}</div>
          <input type="number" min={2000} max={2100} className={inputCls + " max-w-[110px]"} value={summaryYear} onChange={(e) => setSummaryYear(Number(e.target.value))} />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-[var(--color-muted)]"><div className="text-xs text-[var(--color-muted-fg)]">Gross</div><div className="font-bold">{fmtN(summaryAnnual.gross)}</div></div>
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-[var(--color-muted)]"><div className="text-xs text-[var(--color-muted-fg)]">PAYE</div><div className="font-bold text-sky-600">{fmtN(summaryAnnual.paye)}</div></div>
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-[var(--color-muted)]"><div className="text-xs text-[var(--color-muted-fg)]">Pension</div><div className="font-bold text-violet-600">{fmtN(summaryAnnual.pension)}</div></div>
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-[var(--color-muted)]"><div className="text-xs text-[var(--color-muted-fg)]">NHF</div><div className="font-bold text-amber-600">{fmtN(summaryAnnual.nhf)}</div></div>
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-[var(--color-muted)]"><div className="text-xs text-[var(--color-muted-fg)]">Net</div><div className="font-bold text-emerald-600">{fmtN(summaryAnnual.net)}</div></div>
        </div>
        <div className="mt-4 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={summaryChart} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v) => [fmtN(Number(v ?? 0)), ""]} />
              <Bar dataKey="Gross" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Net" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {slip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSlip(null)}>
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold">Payslip — {slip.pay_period}{slip.run_number ? ` · ${slip.run_number}` : ""}</h3>
                <p className="text-sm text-[var(--color-muted-fg)]">{slip.staff?.users?.full_name} · {slip.staff?.users?.role}{slip.pay_date ? ` · pay date ${slip.pay_date}` : ""}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button className="rounded-lg border border-[var(--color-border)] p-1.5 text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)]" title="Print payslip" onClick={() => printPayslip(slip)}>
                  <Printer className="h-4 w-4" />
                </button>
                <button className="rounded-lg p-1.5 hover:bg-[var(--color-muted)]" onClick={() => setSlip(null)}>✕</button>
              </div>
            </div>
            {slip.lines.length > 0 ? (
              <>
                <h4 className="mb-1 text-xs font-semibold uppercase text-[var(--color-muted-fg)]">Earnings</h4>
                <div className="space-y-1.5 text-sm">
                  {slip.lines.filter((l) => l.line_type !== "deduction").map((l) => (
                    <div key={l.id} className="flex justify-between border-b border-[var(--color-border)] py-1.5">
                      <span>{l.label}</span><span>{fmtN(l.amount)}</span>
                    </div>
                  ))}
                </div>
                <h4 className="mb-1 mt-4 text-xs font-semibold uppercase text-[var(--color-muted-fg)]">Deductions</h4>
                <div className="space-y-1.5 text-sm">
                  {slip.lines.filter((l) => l.line_type === "deduction").map((l) => (
                    <div key={l.id} className="flex justify-between border-b border-[var(--color-border)] py-1.5">
                      <span>{l.label}</span><span className="text-rose-600">−{fmtN(l.amount)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
            <div className="flex justify-between pt-3 text-base font-bold">
              <span>Net salary</span><span>{fmtN(slip.net_salary)}</span>
            </div>
            {(slip.calc as Record<string, any> | null)?.bandBreakdown ? (
              <div className="mt-4 rounded-xl border border-[var(--color-border)] p-3">
                <h4 className="mb-1 text-xs font-semibold uppercase text-[var(--color-muted-fg)]">Tax computation</h4>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between"><span>Chargeable income</span><b>{fmtN(Number((slip.calc as any)?.chargeableIncome) || 0)}</b></div>
                  <div className="flex justify-between"><span>Annual PAYE</span><b>{fmtN(Number((slip.calc as any)?.annualPAYE) || 0)}</b></div>
                  <div className="flex justify-between"><span>Effective rate</span><b>{Number((slip.calc as any)?.effectiveRatePct ?? 0).toFixed(2)}%</b></div>
                </div>
                <table className="mt-2 w-full text-xs">
                  <thead><tr className="border-b border-[var(--color-border)] text-left text-[var(--color-muted-fg)]"><th className="py-1">Band</th><th className="py-1 text-right">Taxable</th><th className="py-1 text-right">Rate</th><th className="py-1 text-right">Tax</th></tr></thead>
                  <tbody>
                    {((slip.calc as any)?.bandBreakdown ?? []).map((b: { bandName: string; taxableAmount: number; rate: number; taxAmount: number }, i: number) => (
                      <tr key={i} className="border-b border-[var(--color-border)]/50">
                        <td className="py-1">{b.bandName}</td>
                        <td className="py-1 text-right">{fmtN(b.taxableAmount)}</td>
                        <td className="py-1 text-right">{(b.rate * 100).toFixed(0)}%</td>
                        <td className="py-1 text-right">{fmtN(b.taxAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <div className="mt-3 text-xs text-[var(--color-muted-fg)]">
              {slip.run_number ? `${slip.run_number} · ` : ""}{slip.status} · PAYE {fmtN(slip.paye || 0)} · Pension {fmtN(slip.pension_ee || 0)} · NHF {fmtN(slip.nhf || 0)}
            </div>
          </div>
        </div>
      )}

      {bulkEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setBulkEditOpen(false)}>
          <form className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()} onSubmit={submitBulkEdit}>
            <h3 className="mb-1 text-lg font-semibold">Edit {selDraftIds.length} draft record(s)</h3>
            <p className="mb-4 text-sm text-[var(--color-muted-fg)]">Fields left blank keep their current value. Net salary is recomputed per record from its calculated base.</p>
            <div className="space-y-3">
              <div><label className="mb-1 block text-sm font-medium">Allowances (₦)</label>
                <input type="number" min="0" className={inputCls} placeholder="Leave blank to keep" value={bulkAllow} onChange={(e) => setBulkAllow(e.target.value)} /></div>
              <div><label className="mb-1 block text-sm font-medium">Bonus (₦)</label>
                <input type="number" min="0" className={inputCls} placeholder="Leave blank to keep" value={bulkBonus} onChange={(e) => setBulkBonus(e.target.value)} /></div>
              <div><label className="mb-1 block text-sm font-medium">Deductions (₦)</label>
                <input type="number" min="0" className={inputCls} placeholder="Leave blank to keep" value={bulkDed} onChange={(e) => setBulkDed(e.target.value)} /></div>
              <div><label className="mb-1 block text-sm font-medium">Overtime pay (₦)</label>
                <input type="number" min="0" className={inputCls} placeholder="Leave blank to keep" value={bulkOt} onChange={(e) => setBulkOt(e.target.value)} /></div>
              <div><label className="mb-1 block text-sm font-medium">Notes</label>
                <input type="text" className={inputCls} placeholder="Leave blank to keep" value={bulkNotes} onChange={(e) => setBulkNotes(e.target.value)} /></div>
              {bulkBug && <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">{bulkBug}</div>}
              <button type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90">
                Apply to {selDraftIds.length} record(s)
              </button>
            </div>
          </form>
        </div>
      )}

      {showRun && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowRun(false)}>
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1 text-lg font-semibold">Run payroll — {period}</h3>
            <p className="mb-4 text-sm text-[var(--color-muted-fg)]">Computes gross → statutory (pension, NHIS, NHF, PAYE) → net for every active staff member. Re-running an existing draft recalculates it; paid periods are locked.</p>
            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium">Pay date</label>
              <input type="date" className={inputCls} value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            </div>
            <div className="mb-4">
              <div className="mb-1 flex items-center justify-between">
                <label className="text-sm font-medium">Staff ({selectedStaff ? `${selectedStaff.length} selected` : "all active"})</label>
                {selectedStaff && (
                  <button className="text-xs font-medium text-[var(--color-primary)]" onClick={() => setSelectedStaff(null)}>Clear selection</button>
                )}
              </div>
              <input className={inputCls + " mb-2"} placeholder="Search staff…" value={staffSearch} onChange={(e) => setStaffSearch(e.target.value)} />
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-[var(--color-border)] p-2">
                {staffFiltered.map((s) => (
                  <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-[var(--color-muted)]">
                    <input
                      type="checkbox"
                      checked={!selectedStaff || selectedStaff.includes(s.id)}
                      onChange={(e) => {
                        setSelectedStaff((prev) => {
                          const cur = prev === null ? staffOptions.map((x) => x.id) : prev;
                          return e.target.checked ? [...cur, s.id] : cur.filter((x) => x !== s.id);
                        });
                      }}
                    />
                    <span>{s.name}</span>
                    <span className="ml-auto text-xs text-[var(--color-muted-fg)]">{s.number}</span>
                  </label>
                ))}
                {staffFiltered.length === 0 && <p className="px-2 py-1 text-sm text-[var(--color-muted-fg)]">No staff match.</p>}
              </div>
            </div>
            {error && <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              onClick={runPayroll}
              disabled={running}
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run payroll
            </button>
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

function inPeriod(dateIso: string | null | undefined, from: string, to: string) {
  if (!dateIso) return true;
  const d = dateIso.slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}