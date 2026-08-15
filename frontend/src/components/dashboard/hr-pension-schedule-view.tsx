"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Download, FileText, Loader2, Printer, Trash2 } from "lucide-react";
import { bulkDeleteLines, calcOf, fetchRunDetail, fetchRuns, fmtDate, fmtN, HrRunLine, printScheduleDoc, STATUS_CHIP } from "@/lib/hr-schedules";
import { dateStamp } from "@/lib/export";

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";

const HR_ADMIN_ROLES = ["hospital_admin", "hr_officer", "super_admin"];

export default function HrPensionScheduleView() {
  const [runs, setRuns] = useState<Array<Record<string, any>>>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [selectedRun, setSelectedRun] = useState("");
  const [lines, setLines] = useState<HrRunLine[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadRuns = useCallback(async () => {
    setRunsLoading(true);
    try {
      const me = await (await fetch("/api/auth/me", { cache: "no-store" })).json();
      setIsAdmin(HR_ADMIN_ROLES.includes(me.data?.claims?.role));
      setRuns(await fetchRuns());
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
    try {
      const d = await fetchRunDetail(runNumber);
      setLines(d.lines);
    } catch (e) {
      setLines([]);
      setError(e instanceof Error ? e.message : "Failed to load run");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  const selectedRunMeta = runs.find((r) => r.runNumber === selectedRun) ?? null;
  const isDraftRun = selectedRunMeta?.status === "draft";

  const totals = useMemo(
    () =>
      lines.reduce(
        (a, l) => {
          const ee = Number(l.pension_ee) || 0;
          const er = Number(l.pension_employer) || 0;
          return { pensionable: a.pensionable + pensionableOf(l), ee: a.ee + ee, er: a.er + er, total: a.total + ee + er };
        },
        { pensionable: 0, ee: 0, er: 0, total: 0 }
      ),
    [lines]
  );

  function exportCSV() {
    const headers = ["Staff ID", "Employee", "Gross Pay", "Pensionable Earnings", "Employee 8%", "Employer 10%", "Total Contribution"];
    const rows = lines.map((l) => [
      l.staff?.staff_number ?? "",
      l.staff?.users?.full_name ?? "",
      (Number(l.base_salary) || 0).toFixed(2),
      pensionableOf(l).toFixed(2),
      (Number(l.pension_ee) || 0).toFixed(2),
      (Number(l.pension_employer) || 0).toFixed(2),
      ((Number(l.pension_ee) || 0) + (Number(l.pension_employer) || 0)).toFixed(2),
    ]);
    const csv = ["\uFEFF", [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n")].join("");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `pension-schedule-${selectedRun || "all"}-${dateStamp()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function printPDF() {
    const rows = lines.map((l) => {
      const tot = (Number(l.pension_ee) || 0) + (Number(l.pension_employer) || 0);
      return `<tr>
        <td style="font-family:monospace;color:#64748b">${l.staff?.staff_number || "—"}</td>
        <td>${l.staff?.users?.full_name ?? ""}</td>
        <td class="r">${fmtN(Number(l.base_salary) || 0)}</td>
        <td class="r">${fmtN(pensionableOf(l))}</td>
        <td class="r" style="color:#d97706">${fmtN(Number(l.pension_ee) || 0)}</td>
        <td class="r" style="color:#4f46e5">${fmtN(Number(l.pension_employer) || 0)}</td>
        <td class="r" style="font-weight:700">${fmtN(tot)}</td>
      </tr>`;
    });
    const totalRow = `<tr class="total-row"><td colspan="2">TOTAL (${lines.length} employees)</td><td class="r">—</td><td class="r">${fmtN(totals.pensionable)}</td><td class="r" style="color:#d97706">${fmtN(totals.ee)}</td><td class="r" style="color:#4f46e5">${fmtN(totals.er)}</td><td class="r">${fmtN(totals.total)}</td></tr>`;
    await printScheduleDoc({
      title: "Pension Schedule",
      periodLine: `${selectedRunMeta?.runNumber ?? selectedRun} — ${fmtDate(selectedRunMeta?.payDate)} &bull; Status: ${selectedRunMeta?.status ?? ""}`,
      headers: ["Staff ID", "Employee", "Gross Pay", "Pensionable", "Employee 8%", "Employer 10%", "Total"],
      rows,
      totalsRow: totalRow,
      rightAligned: [2, 3, 4, 5, 6],
    });
  }

  async function deleteLine(line: HrRunLine) {
    if (!confirm(`Delete pension line for ${line.staff?.users?.full_name ?? "this employee"}?`)) return;
    await runDelete([line.id]);
  }

  async function deleteSelected() {
    if (!confirm(`Delete ${selectedIds.length} selected line(s)?`)) return;
    await runDelete(selectedIds);
  }

  async function runDelete(ids: string[]) {
    setDeleting(true);
    setError(null);
    setMsg(null);
    try {
      const d = await bulkDeleteLines(selectedRun, ids);
      setMsg(`Deleted ${d.processed} line(s).`);
      if ((d.skipped?.length ?? 0) > 0) setError(`Skipped: ${d.skipped.map((s) => s.reason).join(", ")}`);
      await loadDetail(selectedRun);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  const allSelected = lines.length > 0 && selectedIds.length === lines.length;

  return (
    <div className="space-y-4">
      {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {msg && <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{msg}</div>}

      <div className="flex flex-wrap items-center gap-3">
        {lines.length > 0 && isAdmin && (
          <>
            {selectedIds.length > 0 && isDraftRun && (
              <button
                onClick={deleteSelected}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-100 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete ({selectedIds.length})
              </button>
            )}
            <button onClick={printPDF} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-xs font-medium text-white hover:opacity-90">
              <Printer className="h-3.5 w-3.5" /> PDF
            </button>
            <button onClick={exportCSV} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)]">
              <Download className="h-3.5 w-3.5" /> Export CSV
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
        {selectedRunMeta && (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            Status: <span className={`rounded-full px-1.5 py-0.5 font-semibold ${STATUS_CHIP[selectedRunMeta.status] ?? ""}`}>{selectedRunMeta.status}</span>
            {selectedRunMeta.payDate ? ` · Pay date ${fmtDate(selectedRunMeta.payDate)}` : ""}
          </span>
        )}
      </div>

      {!selectedRun ? (
        <div className="rounded-2xl border border-[var(--color-border)] bg-white py-16 text-center">
          <FileText className="mx-auto mb-3 h-8 w-8 text-[var(--color-muted-fg)]/40" />
          <p className="text-sm font-medium text-[var(--color-muted-fg)]">Select a payroll run</p>
          <p className="mt-1 text-xs text-[var(--color-muted-fg)]/70">Choose a run to view its pension schedule</p>
        </div>
      ) : detailLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--color-border)] bg-white py-16 text-sm text-[var(--color-muted-fg)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading...
        </div>
      ) : lines.length === 0 ? (
        <div className="rounded-2xl border border-[var(--color-border)] bg-white py-16 text-center">
          <AlertCircle className="mx-auto mb-3 h-6 w-6 text-[var(--color-muted-fg)]/40" />
          <p className="text-sm text-[var(--color-muted-fg)]">No employee lines found in this run.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--color-border)] text-[11px] uppercase text-[var(--color-muted-fg)]">
              <tr>
                {isAdmin && (
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select all lines"
                      checked={allSelected}
                      disabled={!isDraftRun}
                      onChange={(e) => setSelectedIds(e.target.checked ? lines.map((l) => l.id) : [])}
                    />
                  </th>
                )}
                <th className="px-3 py-3">Staff ID</th>
                <th className="px-3 py-3">Employee</th>
                <th className="px-3 py-3 text-right">Gross Pay</th>
                <th className="px-3 py-3 text-right">Pensionable</th>
                <th className="px-3 py-3 text-right">Employee 8%</th>
                <th className="px-3 py-3 text-right">Employer 10%</th>
                <th className="px-3 py-3 text-right">Total</th>
                {isAdmin && <th className="w-16 px-3 py-3 text-left" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {lines.map((l) => {
                const tot = (Number(l.pension_ee) || 0) + (Number(l.pension_employer) || 0);
                return (
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
                    <td className="px-3 py-2.5 text-right font-mono">{fmtN(Number(l.base_salary) || 0)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmtN(pensionableOf(l))}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-amber-600">{fmtN(Number(l.pension_ee) || 0)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-indigo-600">{fmtN(Number(l.pension_employer) || 0)}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold">{fmtN(tot)}</td>
                    {isAdmin && (
                      <td className="px-3 py-2.5">
                        {isDraftRun && (
                          <button onClick={() => void deleteLine(l)} disabled={deleting} className="rounded-lg p-1 text-[var(--color-muted-fg)] hover:bg-rose-50 hover:text-rose-600" title="Delete">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--color-border)] bg-slate-50 font-semibold">
                <td colSpan={isAdmin ? 3 : 2} className="px-4 py-3 text-[var(--color-muted-fg)]">
                  Totals
                </td>
                <td className="px-3 py-3 text-right">—</td>
                <td className="px-3 py-3 text-right">{fmtN(totals.pensionable)}</td>
                <td className="px-3 py-3 text-right text-amber-700">{fmtN(totals.ee)}</td>
                <td className="px-3 py-3 text-right text-indigo-700">{fmtN(totals.er)}</td>
                <td className="px-3 py-3 text-right">{fmtN(totals.total)}</td>
                {isAdmin && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function pensionableOf(l: HrRunLine): number {
  const c = calcOf(l);
  const fromCalc = Number(c.pensionableEarnings);
  if (Number.isFinite(fromCalc) && fromCalc > 0) return fromCalc;
  const fromBasic = Number(c.basicSalary);
  return Number.isFinite(fromBasic) ? fromBasic : 0;
}