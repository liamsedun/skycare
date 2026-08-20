"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Download, FileText, Loader2, Printer, Search, Trash2, X } from "lucide-react";
import { bulkDeleteLines, calcOf, fetchRunDetail, fetchRuns, fmtDate, fmtN, HrRunLine, openPrintWindow, payslipPrintHtml, STATUS_CHIP } from "@/lib/hr-schedules";
import { dateStamp } from "@/lib/export";
import { mutedFg, divideBorder, flexGap2, mutedSmPlain, spinner, rowStart } from "@/lib/ui-constants";

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";

const HR_ADMIN_ROLES = ["hospital_admin", "hr_officer", "super_admin"];

interface ViewingPayslip {
  line: HrRunLine;
  run: { runNumber: string; period: string; payDate: string | null };
}

export default function HrPayslipsView() {
  const [runs, setRuns] = useState<Array<Record<string, any>>>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [selectedRun, setSelectedRun] = useState("");
  const [runMeta, setRunMeta] = useState<{ runNumber: string; period: string; payDate: string | null; status: string } | null>(null);
  const [lines, setLines] = useState<HrRunLine[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewing, setViewing] = useState<ViewingPayslip | null>(null);
  const [brand, setBrand] = useState<Record<string, any> | null>(null);

  const loadRuns = useCallback(async () => {
    setRunsLoading(true);
    try {
      const me = await (await fetch("/api/auth/me", { cache: "no-store" })).json();
      setIsAdmin(HR_ADMIN_ROLES.includes(me.data?.claims?.role));
      setRuns(await fetchRuns());
      fetch("/api/tenant/branding", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.resolve({ data: null })))
        .then((b) => setBrand((b?.data as Record<string, any> | null) ?? null))
        .catch(() => setBrand(null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load runs");
    } finally {
      setRunsLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (runNumber: string) => {
    setDetailLoading(true);
    setError(null);
    setMsg(null);
    setSelectedIds([]);
    setViewing(null);
    try {
      const d = await fetchRunDetail(runNumber);
      setRunMeta(d.run);
      setLines(d.lines);
    } catch (e) {
      setRunMeta(null);
      setLines([]);
      setError(e instanceof Error ? e.message : "Failed to load run");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  const isDraftRun = runMeta?.status === "draft";

  const filtered = useMemo(() => {
    if (!search) return lines;
    const q = search.toLowerCase();
    return lines.filter(
      (l) =>
        (l.staff?.users?.full_name ?? "").toLowerCase().includes(q) ||
        (l.staff?.staff_number ?? "").toLowerCase().includes(q) ||
        (l.staff?.department ?? "").toLowerCase().includes(q)
    );
  }, [lines, search]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (a, l) => ({
          gross: a.gross + (Number(l.base_salary) || 0),
          paye: a.paye + (Number(l.paye) || 0),
          pension: a.pension + (Number(l.pension_ee) || 0),
          nhf: a.nhf + (Number(l.nhf) || 0),
          net: a.net + (Number(l.net_salary) || 0),
        }),
        { gross: 0, paye: 0, pension: 0, nhf: 0, net: 0 }
      ),
    [filtered]
  );

  function exportCSV() {
    const headers = ["Staff ID", "Employee", "Department", "Gross", "Basic", "PAYE", "Pension", "NHIS", "NHF", "Internal Deductions", "Net"];
    const rows = filtered.map((l) => {
      const c = calcOf(l);
      const intDed = Number(l.internal_deductions_total) || 0;
      return [
        l.staff?.staff_number ?? "",
        l.staff?.users?.full_name ?? "",
        l.staff?.department ?? "",
        (Number(l.base_salary) || 0).toFixed(2),
        (Number(c.basicSalary) || 0).toFixed(2),
        (Number(l.paye) || 0).toFixed(2),
        (Number(l.pension_ee) || 0).toFixed(2),
        (Number(l.nhis) || 0).toFixed(2),
        (Number(l.nhf) || 0).toFixed(2),
        intDed.toFixed(2),
        (Number(l.net_salary) || 0).toFixed(2),
      ];
    });
    const csv = ["\uFEFF", [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n")].join("");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `payslips_${dateStamp()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function printAll() {
    const htmls = filtered.map((l) => payslipPrintHtml(l, runMeta ?? { runNumber: selectedRun, period: "", payDate: null }, brand));
    openPrintWindow(htmls.join('<div style="page-break-after:always"></div>'));
  }

  function printOne() {
    if (!viewing) return;
    openPrintWindow(payslipPrintHtml(viewing.line, viewing.run, brand));
  }

  async function deleteLine(line: HrRunLine) {
    if (!confirm(`Delete payslip for ${line.staff?.users?.full_name ?? "this employee"}?`)) return;
    await runDelete([line.id]);
  }

  async function deleteSelected() {
    if (!confirm(`Delete ${selectedIds.length} selected payslip(s)?`)) return;
    await runDelete(selectedIds);
  }

  async function runDelete(ids: string[]) {
    setDeleting(true);
    setError(null);
    setMsg(null);
    try {
      const d = await bulkDeleteLines(selectedRun, ids);
      setMsg(`Deleted ${d.processed} payslip(s).`);
      if ((d.skipped?.length ?? 0) > 0) setError(`Skipped: ${d.skipped.map((s) => s.reason).join(", ")}`);
      await loadDetail(selectedRun);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  const allSelected = filtered.length > 0 && selectedIds.length === filtered.length && isDraftRun;

  return (
    <div className="space-y-4">
      {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {msg && <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{msg}</div>}

      <div className="flex flex-wrap items-center gap-3">
        {selectedIds.length > 0 && isAdmin && (
          <button
            onClick={deleteSelected}
            disabled={deleting || !isDraftRun}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-100 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete ({selectedIds.length})
          </button>
        )}
        {lines.length > 0 && (
          <>
            <button onClick={exportCSV} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)]">
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
            <button onClick={printAll} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)]">
              <FileText className="h-3.5 w-3.5" /> PDF
            </button>
          </>
        )}
        {runsLoading ? (
          <select disabled className={inputCls + " max-w-xs bg-slate-50 text-slate-400"}>
            <option>Loading runs...</option>
          </select>
        ) : (
          <select
            key={runs.length}
            value={selectedRun}
            onChange={(e) => {
              setSelectedRun(e.target.value);
              if (e.target.value) void loadDetail(e.target.value);
            }}
            className={inputCls + " max-w-sm"}
          >
            <option value="">Select a payroll run...</option>
            {runs.map((r) => (
              <option key={r.runNumber} value={r.runNumber}>
                {r.runNumber} — {r.period} · {r.staffCount} staff · {r.status}
              </option>
            ))}
          </select>
        )}
        {runMeta && (
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-fg)]" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee..." className={inputCls + " pl-9"} />
          </div>
        )}
        {runMeta && (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            Status: <span className={`rounded-full px-1.5 py-0.5 font-semibold ${STATUS_CHIP[runMeta.status] ?? ""}`}>{runMeta.status}</span>
          </span>
        )}
      </div>

      {!selectedRun ? (
        <div className="rounded-2xl border border-[var(--color-border)] bg-white py-16 text-center">
          <FileText className="mx-auto mb-3 h-8 w-8 text-[var(--color-muted-fg)]/40" />
          <p className="text-sm font-medium text-[var(--color-muted-fg)]">Select a payroll run</p>
          <p className="mt-1 text-xs text-[var(--color-muted-fg)]/70">Choose a run to view employee payslips</p>
        </div>
      ) : detailLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--color-border)] bg-white py-16 text-sm text-[var(--color-muted-fg)]">
          <Loader2 className={spinner} /> Loading payslips...
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-[var(--color-border)] bg-white py-16 text-center">
          <AlertCircle className="mx-auto mb-3 h-6 w-6 text-[var(--color-muted-fg)]/40" />
          <p className={mutedSmPlain}>{search ? "No matching employees" : "No payslips found in this run."}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-white">
          <table className={rowStart}>
            <thead className="border-b border-[var(--color-border)] text-[11px] uppercase text-[var(--color-muted-fg)]">
              <tr>
                {isAdmin && (
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select all payslips"
                      checked={allSelected}
                      disabled={!isDraftRun}
                      onChange={(e) => setSelectedIds(e.target.checked ? filtered.map((l) => l.id) : [])}
                    />
                  </th>
                )}
                <th className="px-3 py-3">Staff ID</th>
                <th className="px-3 py-3">Employee</th>
                <th className="px-3 py-3">Department</th>
                <th className="px-3 py-3 text-right">Gross</th>
                <th className="px-3 py-3 text-right">PAYE</th>
                <th className="px-3 py-3 text-right">Pension</th>
                <th className="px-3 py-3 text-right">NHF</th>
                <th className="px-3 py-3 text-right">Net</th>
                <th className="w-40 px-3 py-3 text-left" />
              </tr>
            </thead>
            <tbody className={divideBorder}>
              {filtered.map((l) => (
                <tr key={l.id} className="hover:bg-[var(--color-muted)]/50">
                  {isAdmin && (
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        aria-label={`Select ${l.staff?.users?.full_name ?? l.id}`}
                        checked={selectedIds.includes(l.id)}
                        disabled={!isDraftRun}
                        title={!isDraftRun ? "Only draft runs can be bulk-processed" : undefined}
                        onChange={(e) => setSelectedIds((prev) => (e.target.checked ? [...prev, l.id] : prev.filter((x) => x !== l.id)))}
                      />
                    </td>
                  )}
                  <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-muted-fg)]">{l.staff?.staff_number ?? "—"}</td>
                  <td className="px-3 py-2.5">{l.staff?.users?.full_name ?? "—"}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted-fg)]">{l.staff?.department ?? "—"}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{fmtN(Number(l.base_salary) || 0)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-rose-600">{fmtN(Number(l.paye) || 0)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-amber-600">{fmtN(Number(l.pension_ee) || 0)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-[var(--color-muted-fg)]">{fmtN(Number(l.nhf) || 0)}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold text-emerald-600">{fmtN(Number(l.net_salary) || 0)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setViewing({ line: l, run: runMeta ?? { runNumber: selectedRun, period: "", payDate: null } })}
                        className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-100"
                      >
                        <FileText className="h-3 w-3" /> View
                      </button>
                      {isAdmin && isDraftRun && (
                        <button
                          onClick={() => void deleteLine(l)}
                          disabled={deleting}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
                        >
                          <Trash2 className="h-3 w-3" /> Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--color-border)] bg-slate-50 font-semibold">
                <td colSpan={isAdmin ? 4 : 3} className="px-4 py-3 text-[var(--color-muted-fg)]">
                  Totals ({filtered.length})
                </td>
                <td className="px-3 py-3 text-right">{fmtN(totals.gross)}</td>
                <td className="px-3 py-3 text-right text-rose-700">{fmtN(totals.paye)}</td>
                <td className="px-3 py-3 text-right text-amber-700">{fmtN(totals.pension)}</td>
                <td className="px-3 py-3 text-right">{fmtN(totals.nhf)}</td>
                <td className="px-3 py-3 text-right text-emerald-700">{fmtN(totals.net)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {viewing && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setViewing(null)} />
          <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
              <h2 className="text-base font-semibold">Payslip</h2>
              <div className={flexGap2}>
                <button onClick={printOne} className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-muted)]">
                  <Printer className="h-3.5 w-3.5" /> Print
                </button>
                <button onClick={printOne} className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
                  <Download className="h-3.5 w-3.5" /> PDF
                </button>
                <button onClick={() => setViewing(null)} className="rounded-lg p-1 hover:bg-[var(--color-muted)]">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              <div className="rounded-xl bg-slate-50 p-4 text-center">
                <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted-fg)]">Net Pay</p>
                <p className="mt-1 text-2xl font-black text-emerald-600">{fmtN(Number(viewing.line.net_salary) || 0)}</p>
                <p className="mt-0.5 text-[10px] text-[var(--color-muted-fg)]">After all deductions</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg bg-[var(--color-muted)]/60 p-3">
                  <span className={mutedFg}>Employee</span>
                  <p className="mt-0.5 font-semibold">{viewing.line.staff?.users?.full_name}</p>
                </div>
                <div className="rounded-lg bg-[var(--color-muted)]/60 p-3">
                  <span className={mutedFg}>Staff ID</span>
                  <p className="mt-0.5 font-semibold">{viewing.line.staff?.staff_number}</p>
                </div>
                <div className="rounded-lg bg-[var(--color-muted)]/60 p-3">
                  <span className={mutedFg}>Department</span>
                  <p className="mt-0.5 font-semibold">{viewing.line.staff?.department || "—"}</p>
                </div>
                <div className="rounded-lg bg-[var(--color-muted)]/60 p-3">
                  <span className={mutedFg}>Pay Period</span>
                  <p className="mt-0.5 font-semibold">
                    {viewing.run.period || viewing.line.pay_period}
                    {viewing.run.payDate ? ` · ${fmtDate(viewing.run.payDate)}` : ""}
                  </p>
                </div>
              </div>
              <div className="space-y-2 border-t border-[var(--color-border)] pt-4 text-sm">
                <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--color-muted-fg)]">Earnings</h4>
                {(() => {
                  const c = calcOf(viewing.line);
                  const rows = [
                    ["Basic Salary", c.basicSalary],
                    ["Housing Allowance", c.housing],
                    ["Transport Allowance", c.transport],
                    ["Utilities Allowance", c.utilities],
                    ["Meals Allowance", c.meals],
                    ["Other Allowances", c.otherAllowances],
                  ];
                  return (
                    <div className="space-y-1">
                      {rows.map(([l, v]) => (
                        <div key={String(l)} className="flex justify-between">
                          <span className={mutedFg}>{String(l)}</span>
                          <span className="font-mono">{fmtN(Number(v) || 0)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between border-t border-[var(--color-border)] pt-1 font-semibold">
                        <span>Total Gross</span>
                        <span className="font-mono">{fmtN(Number(viewing.line.base_salary) || 0)}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div className="space-y-2 border-t border-[var(--color-border)] pt-4 text-sm">
                <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--color-muted-fg)]">Statutory Deductions</h4>
                {(() => {
                  const c = calcOf(viewing.line);
                  const intDedArr = Array.isArray(c.internalDeductions) ? c.internalDeductions : [];
                  const intDedTotal = intDedArr.reduce((s: number, d: { amount: number }) => s + (Number(d.amount) || 0), 0);
                  const totalDed = (Number(viewing.line.paye) || 0) + (Number(viewing.line.pension_ee) || 0) + (Number(viewing.line.nhis) || 0) + (Number(viewing.line.nhf) || 0) + intDedTotal;
                  return (
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className={mutedFg}>PAYE Tax</span>
                        <span className="font-mono text-rose-600">{fmtN(Number(viewing.line.paye) || 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className={mutedFg}>Pension (EE)</span>
                        <span className="font-mono text-amber-600">{fmtN(Number(viewing.line.pension_ee) || 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className={mutedFg}>NHIS (5% of Basic)</span>
                        <span className="font-mono text-amber-600">{fmtN(Number(viewing.line.nhis) || 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className={mutedFg}>NHF (2.5% of Basic)</span>
                        <span className="font-mono">{fmtN(Number(viewing.line.nhf) || 0)}</span>
                      </div>
                      {intDedArr.map((d: { description: string; amount: number }, i: number) => (
                        <div key={i} className="flex justify-between">
                          <span className={mutedFg}>{String(d.description)}</span>
                          <span className="font-mono">{fmtN(Number(d.amount) || 0)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between border-t border-[var(--color-border)] pt-1 font-bold">
                        <span>Total Deductions</span>
                        <span className="font-mono text-rose-600">{fmtN(totalDed)}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div className="flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                <span className="text-sm font-bold text-emerald-800">NET PAY</span>
                <span className="font-mono text-lg font-black text-emerald-700">{fmtN(Number(viewing.line.net_salary) || 0)}</span>
              </div>
              {(() => {
                const c = calcOf(viewing.line);
                const bands = Array.isArray(c.bandBreakdown) ? c.bandBreakdown : [];
                if (bands.length === 0) return null;
                return (
                  <div className="rounded-xl border border-[var(--color-border)] p-3">
                    <h4 className="mb-1 text-xs font-semibold uppercase text-[var(--color-muted-fg)]">Tax computation</h4>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span>Chargeable income</span>
                        <b>{fmtN(Number(c.chargeableIncome) || 0)}</b>
                      </div>
                      <div className="flex justify-between">
                        <span>Annual PAYE</span>
                        <b>{fmtN(Number(c.annualPAYE) || 0)}</b>
                      </div>
                      <div className="flex justify-between">
                        <span>Effective rate</span>
                        <b>{Number(c.effectiveRatePct ?? 0).toFixed(2)}%</b>
                      </div>
                    </div>
                    <table className="mt-2 w-full text-xs">
                      <thead>
                        <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-muted-fg)]">
                          <th className="py-1">Band</th>
                          <th className="py-1 text-right">Taxable</th>
                          <th className="py-1 text-right">Rate</th>
                          <th className="py-1 text-right">Tax</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bands.map((b: { bandName: string; taxableAmount: number; rate: number; taxAmount: number }, i: number) => (
                          <tr key={i} className="border-b border-[var(--color-border)]/50">
                            <td className="py-1">{String(b.bandName)}</td>
                            <td className="py-1 text-right">{fmtN(Number(b.taxableAmount) || 0)}</td>
                            <td className="py-1 text-right">{((Number(b.rate) || 0) * 100).toFixed(0)}%</td>
                            <td className="py-1 text-right">{fmtN(Number(b.taxAmount) || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          </div>
        </>
      )}
    </div>
  );
}