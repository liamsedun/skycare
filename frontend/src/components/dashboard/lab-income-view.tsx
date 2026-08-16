"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarRange, Eye, Loader2, ReceiptText, Wallet, X } from "lucide-react";
import { ngn } from "@/lib/auth";
import ImportExportMenu from "@/components/ui/import-export-menu";
import type { ImportResult } from "@/components/ui/csv-import-modal";
import { printTable } from "@/lib/export";
import type { AccessLevel } from "@/lib/nav";

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

interface LabRequestRow {
  id: string;
  status: string;
  requested_at: string;
  completed_at: string | null;
  referrer: string | null;
  patients: { patient_number: string; first_name: string; last_name: string; is_walk_in: boolean | null } | null;
  lab_request_items: Array<{
    id: string;
    service_name: string | null;
    priority: string | null;
    sample_type: string | null;
    result: string | null;
    result_unit: string | null;
    is_abnormal: boolean | null;
  }>;
  lab_request_assignments: Array<{ users: { full_name: string; role: string } | null }>;
  invoices: { invoice_number: string; status: string; total_amount: number } | null;
  payments: { reference: string | null; payment_method: string; amount: number; status: string; paid_at: string | null } | null;
}

const LAB_STATUS_CLASS: Record<string, string> = {
  requested: "bg-amber-100 text-amber-700",
  sample_collected: "bg-sky-100 text-sky-700",
  in_progress: "bg-indigo-100 text-indigo-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
};

function labStatusBadge(status: string) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${LAB_STATUS_CLASS[status] ?? "bg-slate-100 text-slate-600"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export default function LabIncomeView({ accessLevel = "full", myRole }: { accessLevel?: AccessLevel; myRole?: string }) {
  const viewOnly = accessLevel === "view_only";
  const [rows, setRows] = useState<IncomeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [detail, setDetail] = useState<IncomeRow | null>(null);

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
              allowImport={!viewOnly}
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
                <th className="px-4 py-2.5 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-[var(--color-muted-fg)]">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-[var(--color-muted-fg)]">No lab income recorded in this period.</td></tr>
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
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => setDetail(r)}
                        className="focus-ring inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-primary)] transition-colors duration-200 hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]"
                      >
                        <Eye size={13} aria-hidden="true" /> View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (
        <IncomeDetailModal
          service={detail}
          from={from}
          to={to}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}

function IncomeDetailModal({ service, from, to, onClose }: { service: IncomeRow; from: string; to: string; onClose: () => void }) {
  const [rows, setRows] = useState<LabRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ serviceId: service.serviceId, serviceName: service.serviceName });
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        const res = await fetch(`/api/lab/income/requests?${params.toString()}`, { cache: "no-store" });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to load test details");
        setRows(body.data?.requests ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load test details");
      } finally {
        setLoading(false);
      }
    })();
  }, [service.serviceId, service.serviceName, from, to]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Tests for ${service.serviceName}`}
    >
      <div className="my-4 w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-[var(--color-foreground)]">Tests — {service.serviceName}</h3>
            <p className="mt-0.5 text-xs text-[var(--color-muted-fg)]">
              Individual testings behind this service{from || to ? ` · ${from || "…"} → ${to || "…"}` : " · all time"}
            </p>
          </div>
          <button type="button" onClick={onClose} className="focus-ring rounded-lg p-2 text-[var(--color-muted-fg)] hover:bg-slate-100" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">{error}</p>
        )}

        {loading ? (
          <p className="py-10 text-center text-sm text-[var(--color-muted-fg)]">Loading tests…</p>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-[var(--color-muted-fg)]">No testings found for this service in the selected period.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {rows.map((r) => {
              const technician = (r.lab_request_assignments ?? []).map((a) => a.users?.full_name).filter(Boolean).join(", ") || "—";
              const patient = r.patients ? `${r.patients.first_name} ${r.patients.last_name}${r.patients.is_walk_in ? " (walk-in)" : ""}` : "—";
              return (
                <div key={r.id} className="rounded-xl border border-[var(--color-border)] p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-[var(--color-muted-fg)]">{r.patients?.patient_number ?? ""}</span>
                    <span className="text-sm font-semibold text-[var(--color-foreground)]">{patient}</span>
                    {r.referrer && (
                      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700">{r.referrer}</span>
                    )}
                    {labStatusBadge(r.status)}
                    <span className="ml-auto text-xs text-[var(--color-muted-fg)]">
                      {new Date(r.requested_at).toLocaleDateString()} {r.completed_at ? `· done ${new Date(r.completed_at).toLocaleDateString()}` : ""}
                    </span>
                  </div>
                  <div className="mt-2.5 overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-[var(--color-border)] text-[11px] uppercase tracking-wide text-[var(--color-muted-fg)]">
                          <th className="py-1.5 pr-3 font-semibold">Test</th>
                          <th className="py-1.5 pr-3 font-semibold">Sample</th>
                          <th className="py-1.5 pr-3 font-semibold">Result</th>
                          <th className="py-1.5 font-semibold text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--color-border)]">
                        {(r.lab_request_items ?? []).map((it) => (
                          <tr key={it.id}>
                            <td className="py-1.5 pr-3 font-medium text-[var(--color-foreground)]">{it.service_name ?? "—"}</td>
                            <td className="py-1.5 pr-3 text-[var(--color-muted-fg)]">{it.sample_type ?? "—"}</td>
                            <td className="py-1.5 pr-3">
                              {it.result ? (
                                <>
                                  <span className="text-[var(--color-foreground)]">{it.result}</span>
                                  {it.result_unit && <span className="ml-0.5 text-xs text-[var(--color-muted-fg)]">{it.result_unit}</span>}
                                  {it.is_abnormal && (
                                    <span className="ml-1.5 rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-red-700">abnormal</span>
                                  )}
                                </>
                              ) : (
                                <span className="text-[var(--color-muted-fg)]">not reported</span>
                              )}
                            </td>
                            <td className="py-1.5 text-right">
                              {it.result ? (
                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">reported</span>
                              ) : (
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">pending</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-muted-fg)]">
                    <span>Technician: <span className="text-[var(--color-foreground)]">{technician}</span></span>
                    {r.invoices && (
                      <span>
                        Invoice: <span className="font-medium text-[var(--color-foreground)]">{r.invoices.invoice_number}</span> ({r.invoices.status}) · {ngn(Number(r.invoices.total_amount) || 0)}
                      </span>
                    )}
                    {r.payments && (
                      <span>
                        Paid: <span className="font-medium text-emerald-600">{ngn(Number(r.payments.amount) || 0)}</span>
                        {r.payments.payment_method && <span className="capitalize"> ({r.payments.payment_method.replace(/_/g, " ")})</span>}
                        {r.payments.reference && <span> · {r.payments.reference}</span>}
                      </span>
                    )}
                    {!r.invoices && !r.payments && <span>No invoice / payment linked</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
