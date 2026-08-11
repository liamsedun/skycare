"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarRange, Loader2, ReceiptText, Wallet } from "lucide-react";
import { ngn } from "@/lib/auth";
import ImportExportMenu from "@/components/ui/import-export-menu";
import type { ImportResult } from "@/components/ui/csv-import-modal";
import { printTable } from "@/lib/export";

// ============================================================================
// Lab Services Income — per-service billed vs collected for a from/to window
// (powered by lab_income_report), with CSV export.
// ============================================================================

const btnPrimary =
  "focus-ring inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60";
const inputCls =
  "h-10 rounded-lg border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-foreground)] outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";

interface IncomeRow {
  serviceId: string;
  serviceName: string;
  category: string;
  qty: number;
  billed: number;
  paid: number;
}

export default function LabIncomeView() {
  const [rows, setRows] = useState<IncomeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    try {
      const res = await fetch(`/api/lab/income?${params.toString()}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load lab income");
      setRows(body.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load lab income");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(
    () => rows.reduce(
      (a, r) => ({ billed: a.billed + Number(r.billed ?? 0), paid: a.paid + Number(r.paid ?? 0), qty: a.qty + Number(r.qty ?? 0) }),
      { billed: 0, paid: 0, qty: 0 },
    ),
    [rows],
  );

  function exportCsv() {
    if (rows.length === 0) { alert("Nothing to export — no lab income in this period."); return; }
    const head = "Service,Category,Times billed,Income (billed),Collected\n";
    const lines = rows.map((r) => [
      `"${r.serviceName?.replace(/"/g, '""') ?? ""}"`,
      `"${r.category ?? ""}"`,
      r.qty,
      r.billed,
      r.paid,
    ].join(","));
    const blob = new Blob([head + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `lab-income-${from || "all"}-${to || "now"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportPdf() {
    if (rows.length === 0) { alert("Nothing to export — no lab income in this period."); return; }
    printTable("Lab Services Income", ["Service", "Category", "Times billed", "Income (billed)", "Collected"],
      rows.map((r) => [r.serviceName ?? "", r.category ?? "", r.qty, r.billed, r.paid]));
  }

  async function importIncome(): Promise<ImportResult> {
    return {
      created: 0,
      failed: 0,
      errors: ["Lab Services Income is a derived report from lab orders and invoices and cannot be imported."],
    };
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-[var(--color-foreground)]">
              <Wallet className="h-5 w-5 text-[var(--color-primary)]" /> Lab Services Income
            </h2>
            <p className="mt-0.5 text-xs text-[var(--color-muted-fg)]">
              Revenue by lab service — billed vs collected, for the selected period.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-[var(--color-muted-fg)]">
              <CalendarRange size={13} /> From
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-[var(--color-muted-fg)]">
              To
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
            </label>
            <button type="button" className={btnPrimary} onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ReceiptText className="h-3.5 w-3.5" />}
              Apply
            </button>
            <ImportExportMenu
              entityLabel="Lab Services Income"
              exportCsv={exportCsv}
              exportPdf={exportPdf}
              importColumns={["Service", "Category", "Times billed", "Income (billed)", "Collected"]}
              templateFilename="lab-income-import-template.csv"
              onImport={importIncome}
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-[var(--color-border)] bg-white p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-muted-fg)]">Billed</p>
            <p className="mt-1 text-lg font-bold text-[var(--color-foreground)]">{ngn(totals.billed)}</p>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-white p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-muted-fg)]">Collected</p>
            <p className="mt-1 text-lg font-bold text-emerald-600">{ngn(totals.paid)}</p>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-white p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-muted-fg)]">Services</p>
            <p className="mt-1 text-lg font-bold text-[var(--color-foreground)]">{rows.length}</p>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-white p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-muted-fg)]">Items billed</p>
            <p className="mt-1 text-lg font-bold text-[var(--color-foreground)]">{totals.qty}</p>
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-[var(--color-muted)] text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">
              <tr>
                <th className="px-4 py-2.5">Service</th>
                <th className="px-4 py-2.5">Type</th>
                <th className="px-4 py-2.5 text-right">Items</th>
                <th className="px-4 py-2.5 text-right">Billed</th>
                <th className="px-4 py-2.5 text-right">Collected</th>
                <th className="px-4 py-2.5 text-right">Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-[var(--color-muted-fg)]">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-[var(--color-muted-fg)]">No lab income recorded in this period.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.serviceId}>
                    <td className="px-4 py-2.5 font-medium text-[var(--color-foreground)]">{r.serviceName}</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${r.category === "imaging" ? "bg-sky-100 text-sky-700" : "bg-violet-100 text-violet-700"}`}>
                        {r.category ?? "lab"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">{r.qty}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">{ngn(Number(r.billed) || 0)}</td>
                    <td className="px-4 py-2.5 text-right text-emerald-600">{ngn(Number(r.paid) || 0)}</td>
                    <td className="px-4 py-2.5 text-right text-amber-600">{ngn((Number(r.billed) || 0) - (Number(r.paid) || 0))}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}