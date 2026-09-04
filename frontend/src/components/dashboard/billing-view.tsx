"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Banknote, CalendarDays, Hourglass, Plus, Printer, ReceiptText, Search, Wallet } from "lucide-react";
import DateRangeBar from "@/components/filters/date-range-bar";
import ImportExportMenu from "@/components/ui/import-export-menu";
import type { ImportResult } from "@/components/ui/csv-import-modal";
import { inDateRange } from "@/lib/daterange";
import { dateStamp, downloadCsv, printTable } from "@/lib/export";
import { emptyState, errorBanner, fgMedium, fgSemibold, flexGap2, flexWrapGap2, mutedFg, mutedSm, mutedXs, pageTitle, sectionTitle } from "@/lib/ui-constants";
import type { AccessLevel } from "@/lib/nav";
import BranchFilter from "@/components/dashboard/branch-filter";
import { useBranch } from "@/lib/branch-context";
import { KpiCard } from "./billing/billing-kpi";
import { CreateInvoiceModal, InvoiceDetailModal } from "./billing/billing-modals";
import { fetchAllPatients, inputCls, ngn, printHref, SOURCE_FILTERS, SOURCE_META, STATUS_FILTERS, statusClass, type Invoice, type PendingPayment } from "./billing/billing-shared";

export default function BillingView({ accessLevel = "full", myRole }: { accessLevel?: AccessLevel; myRole?: string }) {
  const viewOnly = accessLevel === "view_only";
  const router = useRouter();
  const { selectedBranchId } = useBranch();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [pending, setPending] = useState<PendingPayment[]>([]);
  const [summary, setSummary] = useState<{ collected: number; outstanding: number; monthCollected: number; monthOtherIncome: number; monthTotal: number; invoiceCount: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [source, setSource] = useState("all");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [viewed, setViewed] = useState<{ id: string; kind: "central" | "pharmacy" } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ pageSize: "100" });
      if (filter !== "all") params.set("status", filter);
      if (source !== "all") params.set("source", source);
      if (q.trim()) params.set("q", q.trim());
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const branchQs = `&branch=${selectedBranchId ?? ""}`;
      const [invoiceRes, pendingRes, summaryRes] = await Promise.all([
        fetch(`/api/billing/invoices?${params.toString()}${branchQs}`, { cache: "no-store" }),
        fetch(`/api/payments?status=pending&pageSize=100${branchQs}`, { cache: "no-store" }),
        fetch(`/api/billing/summary${branchQs.startsWith("&") ? "?" + branchQs.slice(1) : ""}`, { cache: "no-store" }),
      ]);
      const invoiceBody = await invoiceRes.json();
      const pendingBody = await pendingRes.json();
      if (!invoiceRes.ok) throw new Error(invoiceBody.error ?? "Failed to load invoices");
      setInvoices(invoiceBody.data ?? []);
      setPending(pendingBody.data ?? []);
      if (summaryRes.ok) {
        const summaryBody = await summaryRes.json();
        setSummary(summaryBody.data ?? null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }, [filter, source, q, from, to, selectedBranchId]);

  // Debounce search typing; filters other than q apply immediately.
  useEffect(() => {
    const t = setTimeout(load, q.trim() ? 400 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const totals = useMemo(() => {
    let outstanding = 0;
    for (const inv of invoices) {
      if (["pending", "partially_paid"].includes(inv.status)) {
        outstanding += Number(inv.total_amount) - Number(inv.paid_amount);
      }
    }
    return { outstanding };
  }, [invoices]);

  const visibleInvoices = useMemo(
    () => invoices.filter((inv) => inDateRange(inv.issue_date, from, to)),
    [invoices, from, to]
  );

  const INVOICE_COLUMNS = ["invoice_number", "patient_number", "patient_name", "source", "issue_date", "status", "subtotal", "tax_amount", "discount_amount", "total_amount", "paid_amount"];

  const invoiceRows = () =>
    invoices.map((i) => [
      i.invoice_number,
      i.patients?.patient_number ?? "",
      i.patients ? `${i.patients.first_name} ${i.patients.last_name}` : "Walk-in",
      SOURCE_META[i.source]?.label ?? i.source,
      i.issue_date,
      i.status,
      i.subtotal,
      i.tax_amount,
      i.discount_amount,
      i.total_amount,
      i.paid_amount,
    ]);

  function exportCsv() {
    if (invoices.length === 0) { alert("Nothing to export — there are no invoices yet."); return; }
    downloadCsv(`invoices-${dateStamp()}.csv`, INVOICE_COLUMNS, invoiceRows());
  }

  function exportPdf() {
    if (invoices.length === 0) { alert("Nothing to export — there are no invoices yet."); return; }
    printTable("Billing Invoices", INVOICE_COLUMNS, invoiceRows());
  }

  async function importInvoices(rowsIn: string[][]): Promise<ImportResult> {
    const patients = await fetchAllPatients();
    const patientMap = new Map<string, string>(patients.map((p) => [String(p.patient_number).trim().toLowerCase(), p.id]));
    const errors: string[] = [];
    let created = 0;
    for (let i = 0; i < rowsIn.length; i++) {
      const r = rowsIn[i]!;
      const patientNumber = String(r[0] ?? "").trim();
      const description = String(r[1] ?? "").trim();
      const quantity = Number(r[2]);
      const unitPrice = Number(r[3]);
      if (!description) { errors.push(`Row ${i + 1}: item description is required`); continue; }
      if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
        errors.push(`Row ${i + 1}: quantity and unit price must be positive numbers`);
        continue;
      }
      const patientId = patientMap.get(patientNumber.toLowerCase());
      if (!patientId) { errors.push(`Row ${i + 1}: unknown patient number "${patientNumber}"`); continue; }
      const subtotal = quantity * unitPrice;
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          issueDate: String(r[4] ?? "").trim() || undefined,
          dueDate: String(r[5] ?? "").trim() || undefined,
          notes: String(r[6] ?? "").trim() || undefined,
          subtotal,
          totalAmount: subtotal,
          items: [{ description, quantity, unit_price: unitPrice, total_price: subtotal }],
        }),
      });
      const body = await res.json();
      if (!res.ok) errors.push(`Row ${i + 1}: ${body.error ?? "invoice creation failed"}`);
      else created++;
    }
    return { created, failed: errors.length, errors };
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className={pageTitle}>
            Billing
          </h1>
          <p className={mutedSm}>
            Every income stream — medical services, lab, pharmacy and ward bills.
          </p>
        </div>
        {!viewOnly && (
          <div className={flexWrapGap2}>
            <ImportExportMenu
              entityLabel="Invoices"
              exportCsv={exportCsv}
              exportPdf={exportPdf}
              importColumns={["patient_number", "description", "quantity", "unit_price", "issue_date", "due_date", "notes"]}
              importSample={[["LB-P-0001", "Consultation", "1", "5000", "2026-08-11", "2026-08-25", "Annual checkup"]]}
              templateFilename="invoices-import-template.csv"
              onImport={importInvoices}
              onImported={() => void load()}
            />
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)]"
            >
              <Plus size={16} aria-hidden="true" /> Create Invoice
            </button>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className={errorBanner}>
          {error}
        </p>
      )}

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Outstanding"
          value={ngn(summary ? summary.outstanding : totals.outstanding)}
          icon={Wallet}
          tone="amber"
          hint="Unpaid balances across all sources"
        />
        <KpiCard
          label="Collected · all time"
          value={ngn(summary?.collected ?? 0)}
          icon={Banknote}
          tone="emerald"
          hint="Payments confirmed on every bill"
        />
        <KpiCard
          label="This month"
          value={ngn(summary?.monthTotal ?? 0)}
          icon={CalendarDays}
          tone="sky"
          hint="Collected + other income this month"
        />
        <KpiCard
          label="Awaiting confirmation"
          value={String(pending.length)}
          icon={Hourglass}
          tone="violet"
          hint="Patient-declared payments to confirm"
        />
      </div>

      {/* Pending declarations */}
      {pending.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <h2 className="text-sm font-semibold text-amber-800">
            Patient-declared payments awaiting confirmation
          </h2>
          <ul className="mt-3 space-y-2">
            {pending.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm shadow-sm">
                <div>
                  <p className={fgMedium}>
                    {p.patients ? `${p.patients.first_name} ${p.patients.last_name}` : "Patient"} — {ngn(Number(p.amount))}
                  </p>
                  <p className={mutedXs}>
                    {p.reference} · {p.payment_method.replace(/_/g, " ")}
                  </p>
                </div>
                {!viewOnly && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        setError(null);
                        try {
                          const res = await fetch("/api/payments/record", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              patientId: p.patients?.id,
                              amount: Number(p.amount),
                              paymentMethod: p.payment_method,
                              allocation: [{ invoiceId: p.invoice_id, amount: Number(p.amount) }],
                              pendingPaymentId: p.id,
                            }),
                          });
                          const body = await res.json();
                          if (!res.ok) throw new Error(body.error ?? "Failed to confirm");
                          await load();
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "Failed to confirm payment");
                        } finally {
                          setBusy(false);
                        }
                      }}
                      className="focus-ring rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        if (!confirm("Cancel this pending declaration?")) return;
                        setBusy(true);
                        setError(null);
                        try {
                          const res = await fetch("/api/payments/cancel", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ pendingPaymentId: p.id }),
                          });
                          const body = await res.json();
                          if (!res.ok) throw new Error(body.error ?? "Failed to cancel");
                          await load();
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "Failed to cancel payment");
                        } finally {
                          setBusy(false);
                        }
                      }}
                      className="focus-ring rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                    >
                      Decline
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Search + filters */}
      <div className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-sm)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <BranchFilter value={selectedBranchId} onChange={() => {}} hideWhenSingle />
          <div className="relative flex-1">
            <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-fg)]" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by invoice number, patient, service or drug…"
              className={`${inputCls} pl-9`}
            />
          </div>
          <div className={flexWrapGap2}>
            <DateRangeBar
              from={from}
              to={to}
              onFromChange={setFrom}
              onToChange={setTo}
              onClear={() => {
                setFrom("");
                setTo("");
              }}
            />
            {(q || from || to || source !== "all" || filter !== "all") && (
              <button
                type="button"
                onClick={() => { setQ(""); setFrom(""); setTo(""); setSource("all"); setFilter("all"); }}
                className="focus-ring rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-muted-fg)] hover:bg-slate-50"
              >
                Clear
              </button>
            )}
          </div>
        </div>
        <div className={flexWrapGap2}>
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">Source</span>
          {SOURCE_FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setSource(item)}
              aria-pressed={source === item}
              className={`focus-ring inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium capitalize transition-colors duration-200 ${
                source === item
                  ? "bg-[var(--color-primary)] text-white"
                  : "bg-[var(--color-muted)]/40 text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)]"
              }`}
            >
              {item === "all" ? "All sources" : SOURCE_META[item].label}
            </button>
          ))}
          <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">Status</span>
          {STATUS_FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              aria-pressed={filter === item}
              className={`focus-ring rounded-full px-3 py-1.5 text-sm font-medium capitalize transition-colors duration-200 ${
                filter === item
                  ? "bg-[var(--color-primary)] text-white"
                  : "bg-[var(--color-muted)]/40 text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)]"
              }`}
            >
              {item.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Invoice list */}
      {loading ? (
        <p className={emptyState}>Loading invoices…</p>
      ) : visibleInvoices.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-white py-16 text-center shadow-[var(--shadow-sm)]">
          <ReceiptText size={40} aria-hidden="true" className="mx-auto text-[var(--color-muted-fg)]" />
          <p className={sectionTitle}>
            No invoices found.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleInvoices.map((inv) => {
            const outstanding = Number(inv.total_amount) - Number(inv.paid_amount);
            const sourceMeta = SOURCE_META[inv.source] ?? SOURCE_META.medical;
            const SourceIcon = sourceMeta.icon;
            return (
              <div key={`${inv.kind}-${inv.id}`} className="flex flex-col rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-sm)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className={flexGap2}>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${sourceMeta.cls}`}>
                        <SourceIcon size={11} aria-hidden="true" /> {sourceMeta.label}
                      </span>
                      {!inv.patients && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">Walk-in</span>}
                    </div>
                    <p className="mt-1.5 font-mono text-sm font-semibold text-[var(--color-foreground)]">
                      {inv.invoice_number}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-[var(--color-muted-fg)]">
                      {inv.patients ? `${inv.patients.first_name} ${inv.patients.last_name}` : "Walk-in customer"}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusClass(inv.status)}`}>
                    {inv.status.replace(/_/g, " ")}
                  </span>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className={mutedFg}>Total</dt>
                    <dd className={fgSemibold}>{ngn(Number(inv.total_amount))}</dd>
                  </div>
                  <div>
                    <dt className={mutedFg}>Paid</dt>
                    <dd className="font-semibold text-emerald-600">{ngn(Number(inv.paid_amount))}</dd>
                  </div>
                  <div>
                    <dt className={mutedFg}>Balance</dt>
                    <dd className="font-semibold text-amber-600">{ngn(outstanding)}</dd>
                  </div>
                </dl>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setViewed({ id: inv.id, kind: inv.kind })}
                    className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2 text-xs font-semibold text-[var(--color-primary)] transition-colors duration-200 hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]"
                  >
                    {viewOnly ? "View invoice" : "View & record payment"}
                  </button>
                  <a
                    href={printHref(inv)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="focus-ring inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-semibold text-[var(--color-muted-fg)] transition-colors duration-200 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                    title="Print / Save as PDF"
                  >
                    <Printer size={13} aria-hidden="true" /> PDF
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateInvoiceModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load();
            router.refresh();
          }}
        />
      )}

      {viewed && (
        <InvoiceDetailModal
          invoice={invoices.find((i) => i.kind === viewed.kind && i.id === viewed.id) ?? null}
          onClose={() => setViewed(null)}
          onChanged={() => {
            load();
            router.refresh();
          }}
          viewOnly={viewOnly}
        />
      )}
    </div>
  );
}