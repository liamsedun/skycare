"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Banknote,
  BedDouble,
  CalendarDays,
  Hourglass,
  Microscope,
  Pill,
  Plus,
  Printer,
  ReceiptText,
  Search,
  Stethoscope,
  Wallet,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CLINICIAN_ROLES } from "@/lib/auth";
import ImportExportMenu from "@/components/ui/import-export-menu";
import type { ImportResult } from "@/components/ui/csv-import-modal";
import { dateStamp, downloadCsv, printTable } from "@/lib/export";
import { inDateRange } from "@/lib/daterange";
import type { AccessLevel } from "@/lib/nav";
import DateRangeBar from "@/components/filters/date-range-bar";

async function fetchAllPatients() {
  const out: Array<{ id: string; patient_number: string }> = [];
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(`/api/patients?page=${page}&pageSize=100`, { cache: "no-store" });
    if (!res.ok) break;
    const body = await res.json();
    const data = (body.data ?? []) as Array<{ id: string; patient_number: string }>;
    out.push(...data);
    if (data.length < 100) break;
  }
  return out;
}

interface PatientOption {
  id: string;
  label: string;
}

interface Invoice {
  id: string;
  kind: "central" | "pharmacy";
  source: "medical" | "lab" | "ward" | "pharmacy";
  invoice_number: string;
  issue_date: string;
  due_date: string | null;
  status: string;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  paid_amount: number;
  notes: string | null;
  patients: { id: string; patient_number: string; first_name: string; last_name: string } | null;
  invoice_items: Array<{ id: string; description: string; quantity: number; unit_price: number; total_price: number; vat_percent: number; vat_amount: number }>;
  payments: Array<{ id: string; amount: number; payment_method: string; status: string; reference: string | null; paid_at: string }>;
}

interface PendingPayment {
  id: string;
  amount: number;
  payment_method: string;
  reference: string | null;
  paid_at: string;
  invoice_id: string | null;
  patients: { id: string; patient_number: string; first_name: string; last_name: string } | null;
}

const STATUS_FILTERS = ["all", "pending", "partially_paid", "paid", "cancelled", "draft"];
const SOURCE_FILTERS = ["all", "medical", "lab", "pharmacy", "ward"];

const SOURCE_META: Record<string, { label: string; cls: string; icon: LucideIcon }> = {
  medical: { label: "Medical", cls: "bg-sky-100 text-sky-700", icon: Stethoscope },
  lab: { label: "Lab", cls: "bg-indigo-100 text-indigo-700", icon: Microscope },
  ward: { label: "Ward", cls: "bg-fuchsia-100 text-fuchsia-700", icon: BedDouble },
  pharmacy: { label: "Pharmacy", cls: "bg-emerald-100 text-emerald-700", icon: Pill },
};

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";

function ngn(amount: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 2,
  }).format(amount);
}

function statusClass(status: string): string {
  switch (status) {
    case "paid": return "bg-emerald-100 text-emerald-700";
    case "pending": return "bg-amber-100 text-amber-700";
    case "partially_paid": return "bg-sky-100 text-sky-700";
    case "draft": return "bg-slate-100 text-slate-600";
    default: return "bg-red-100 text-red-700";
  }
}

function printHref(inv: Invoice): string {
  return `/app/billing/invoice/${inv.id}/print${inv.kind === "pharmacy" ? "?kind=pharmacy" : ""}`;
}

function KpiCard({ label, value, icon: Icon, tone, hint }: { label: string; value: string; icon: LucideIcon; tone: "amber" | "emerald" | "sky" | "violet"; hint?: string }) {
  const [display, setDisplay] = useState(0);
  const target = useRef(0);
  const parsed = useMemo(() => {
    const raw = value.replace(/[^\d.-]/g, "");
    const n = Number(raw);
    target.current = Number.isFinite(n) ? n : 0;
    return target.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const dur = 600;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      setDisplay(target.current * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [parsed]);

  const gradients: Record<string, string> = {
    amber: "from-amber-500 to-orange-600",
    emerald: "from-emerald-500 to-teal-600",
    sky: "from-sky-500 to-indigo-600",
    violet: "from-violet-500 to-purple-600",
  };

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${gradients[tone]} p-5 text-white shadow-lg`}>
      <Icon size={88} aria-hidden="true" className="absolute -bottom-4 -right-4 text-white/15" />
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
          <Icon size={20} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-white/80">{label}</p>
          <p className="mt-0.5 text-2xl font-bold tracking-tight">
            {new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(display)}
          </p>
        </div>
      </div>
      {hint ? <p className="mt-2 text-[11px] font-medium text-white/70">{hint}</p> : null}
    </div>
  );
}

export default function BillingView({ accessLevel = "full", myRole }: { accessLevel?: AccessLevel; myRole?: string }) {
  const viewOnly = accessLevel === "view_only";
  const router = useRouter();
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
      const [invoiceRes, pendingRes, summaryRes] = await Promise.all([
        fetch(`/api/billing/invoices?${params.toString()}`, { cache: "no-store" }),
        fetch("/api/payments?status=pending&pageSize=100", { cache: "no-store" }),
        fetch("/api/billing/summary", { cache: "no-store" }),
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
  }, [filter, source, q, from, to]);

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
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">
            Billing
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted-fg)]">
            Every income stream — medical services, lab, pharmacy and ward bills.
          </p>
        </div>
        {!viewOnly && (
          <div className="flex flex-wrap items-center gap-2">
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
        <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
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
                  <p className="font-medium text-[var(--color-foreground)]">
                    {p.patients ? `${p.patients.first_name} ${p.patients.last_name}` : "Patient"} — {ngn(Number(p.amount))}
                  </p>
                  <p className="text-xs text-[var(--color-muted-fg)]">
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
          <div className="flex flex-wrap items-center gap-2">
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
        <div className="flex flex-wrap items-center gap-2">
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
        <p className="py-10 text-center text-sm text-[var(--color-muted-fg)]">Loading invoices…</p>
      ) : visibleInvoices.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-white py-16 text-center shadow-[var(--shadow-sm)]">
          <ReceiptText size={40} aria-hidden="true" className="mx-auto text-[var(--color-muted-fg)]" />
          <p className="mt-3 text-sm font-medium text-[var(--color-foreground)]">
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
                    <div className="flex items-center gap-2">
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
                    <dt className="text-[var(--color-muted-fg)]">Total</dt>
                    <dd className="font-semibold text-[var(--color-foreground)]">{ngn(Number(inv.total_amount))}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--color-muted-fg)]">Paid</dt>
                    <dd className="font-semibold text-emerald-600">{ngn(Number(inv.paid_amount))}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--color-muted-fg)]">Balance</dt>
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

function CreateInvoiceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [doctors, setDoctors] = useState<{ id: string; label: string }[]>([]);
  const [items, setItems] = useState([
    { description: "", quantity: 1, unitPrice: 0, vatPercent: 0 },
  ]);
  const [discount, setDiscount] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const [patientRes, staffRes] = await Promise.all([
          fetch("/api/patients?pageSize=100", { cache: "no-store" }),
          fetch("/api/staff?pageSize=100", { cache: "no-store" }),
        ]);
        const patientBody = await patientRes.json();
        const staffBody = await staffRes.json();
        setPatients(
          (patientBody.data ?? []).map((p: { id: string; first_name: string; last_name: string; patient_number: string }) => ({
            id: p.id,
            label: `${p.first_name} ${p.last_name} (${p.patient_number})`,
          }))
        );
        setDoctors(
          (staffBody.data ?? [])
            .filter((s: { users?: { role?: string } }) => !!s.users?.role && ["hospital_admin", "nurse", ...CLINICIAN_ROLES].includes(s.users.role as (typeof CLINICIAN_ROLES)[number]))
            .map((s: { id: string; users?: { id?: string; full_name?: string } }) => ({ id: s.users?.id ?? s.id, label: s.users?.full_name ?? "Doctor" }))
        );
      } catch {
        /* options non-critical */
      }
    })();
  }, []);

  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const tax = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice * item.vatPercent) / 100, 0);
  const total = Math.max(0, subtotal + tax - discount);

  async function handleSubmit(form: FormData) {
    setBusy(true);
    setError(null);
    try {
      const cleanItems = items
        .filter((item) => item.description.trim() && item.quantity > 0)
        .map((item) => ({
          description: item.description.trim(),
          quantity: item.quantity,
          unit_price: item.unitPrice,
          total_price: item.quantity * item.unitPrice,
          vat_percent: item.vatPercent,
          vat_amount: (item.quantity * item.unitPrice * item.vatPercent) / 100,
        }));
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: form.get("patientId"),
          attendingStaffId: (form.get("doctorId") as string) || undefined,
          dueDate: (form.get("dueDate") as string) || undefined,
          subtotal,
          taxAmount: tax,
          discountAmount: discount,
          totalAmount: total,
          notes: (form.get("notes") as string) || undefined,
          items: cleanItems,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to create invoice");
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create invoice");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="Create Invoice" onClose={onClose}>
      <form
        className="mt-5 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit(new FormData(e.currentTarget));
        }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="i-patient">Patient</label>
            <select id="i-patient" name="patientId" required className={inputCls}>
              <option value="">Select patient…</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="i-doctor">Attending staff (optional)</label>
            <select id="i-doctor" name="doctorId" className={inputCls}>
              <option value="">None</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="i-due">Due date (optional)</label>
            <input id="i-due" name="dueDate" type="date" className={inputCls} />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-[var(--color-foreground)]">Items</span>
            <button
              type="button"
              onClick={() => setItems([...items, { description: "", quantity: 1, unitPrice: 0, vatPercent: 0 }])}
              className="focus-ring rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium text-[var(--color-primary)] hover:border-[var(--color-primary)]"
            >
              + Add item
            </button>
          </div>
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2">
                <input
                  value={item.description}
                  onChange={(e) => {
                    const next = [...items];
                    next[idx] = { ...next[idx], description: e.target.value };
                    setItems(next);
                  }}
                  placeholder="Description"
                  required
                  className={`${inputCls} col-span-12 sm:col-span-5`}
                />
                <input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) => {
                    const next = [...items];
                    next[idx] = { ...next[idx], quantity: Number(e.target.value) };
                    setItems(next);
                  }}
                  placeholder="Qty"
                  className={`${inputCls} col-span-4 sm:col-span-2`}
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={item.unitPrice}
                  onChange={(e) => {
                    const next = [...items];
                    next[idx] = { ...next[idx], unitPrice: Number(e.target.value) };
                    setItems(next);
                  }}
                  placeholder="Price"
                  className={`${inputCls} col-span-4 sm:col-span-2`}
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  value={item.vatPercent}
                  onChange={(e) => {
                    const next = [...items];
                    next[idx] = { ...next[idx], vatPercent: Number(e.target.value) };
                    setItems(next);
                  }}
                  placeholder="VAT %"
                  className={`${inputCls} col-span-3 sm:col-span-2`}
                />
                <button
                  type="button"
                  onClick={() => setItems(items.filter((_, i) => i !== idx))}
                  disabled={items.length === 1}
                  className="focus-ring col-span-1 flex items-center justify-center rounded-lg text-[var(--color-muted-fg)] hover:text-red-500 disabled:opacity-30"
                  aria-label="Remove item"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[var(--color-muted)]/40 px-4 py-3 text-sm">
          <span className="text-[var(--color-muted-fg)]">Discount (₦)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={discount}
            onChange={(e) => setDiscount(Number(e.target.value))}
            className={`${inputCls} w-32`}
          />
          <div className="ml-auto text-right">
            <p className="text-[var(--color-muted-fg)]">Subtotal {ngn(subtotal)} · Tax {ngn(tax)}</p>
            <p className="text-lg font-bold text-[var(--color-foreground)]">Total {ngn(total)}</p>
          </div>
        </div>

        <div>
          <label className={labelCls} htmlFor="i-notes">Notes (optional)</label>
          <textarea id="i-notes" name="notes" rows={2} className={inputCls} />
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
            {error}
          </p>
        )}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2.5 text-sm font-medium transition-colors duration-200 hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="focus-ring flex-1 rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60">
            {busy ? "Creating…" : "Create Invoice"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function InvoiceDetailModal({ invoice, onClose, onChanged, viewOnly = false }: { invoice: Invoice | null; onClose: () => void; onChanged: () => void; viewOnly?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState<number>(() => (invoice ? Number(invoice.total_amount) - Number(invoice.paid_amount) : 0));
  const [method, setMethod] = useState("cash");
  const [account, setAccount] = useState("cash");
  const [bankAccounts, setBankAccounts] = useState<{ id: string; bank_name: string; account_name: string; account_number: string }[]>([]);

  useEffect(() => {
    if (invoice) setAmount(Number(invoice.total_amount) - Number(invoice.paid_amount));
  }, [invoice?.id]);

  useEffect(() => {
    (async () => {
      try {
        const br = await fetch("/api/settings/bank-accounts", { cache: "no-store" });
        if (br.ok) {
          const bb = await br.json();
          setBankAccounts(bb.data ?? []);
        }
      } catch {
        /* optional */
      }
    })();
  }, []);

  if (!invoice) return null;

  const isPharmacy = invoice.kind === "pharmacy";
  const outstanding = Number(invoice.total_amount) - Number(invoice.paid_amount);
  const completed = invoice.payments.filter((p) => p.status === "completed");
  const pending = invoice.payments.filter((p) => p.status === "pending");
  const sourceMeta = SOURCE_META[invoice.source] ?? SOURCE_META.medical;
  const SourceIcon = sourceMeta.icon;

  const recordPayment = async () => {
    if (amount <= 0 || amount > outstanding + 0.01) {
      setError("Amount must be positive and not exceed the outstanding balance");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: invoice.patients?.id,
          amount,
          paymentMethod: method,
          accountId: account,
          allocation: [{ invoiceId: invoice.id, amount }],
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to record payment");
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to record payment");
    } finally {
      setBusy(false);
    }
  }

  const cancelInvoice = async () => {
    if (!confirm("Cancel this invoice? Payments will remain on record.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to cancel invoice");
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to cancel invoice");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title={`${invoice.invoice_number} — ${invoice.patients ? `${invoice.patients.first_name} ${invoice.patients.last_name}` : "Walk-in customer"}`} onClose={onClose} wide>
      <div className="mt-5 space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${sourceMeta.cls}`}>
            <SourceIcon size={12} aria-hidden="true" /> {sourceMeta.label}
          </span>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(invoice.status)}`}>
            {invoice.status.replace(/_/g, " ")}
          </span>
          <span className="text-sm text-[var(--color-muted-fg)]">
            Issued {invoice.issue_date}
            {invoice.due_date ? ` · Due ${invoice.due_date}` : ""}
          </span>
          <div className="ml-auto flex gap-2">
            <a
              href={printHref(invoice)}
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-foreground)] hover:bg-slate-50"
            >
              <Printer size={13} aria-hidden="true" /> Print / PDF
            </a>
            {!viewOnly && !isPharmacy && invoice.status !== "paid" && invoice.status !== "cancelled" && (
              <button
                type="button"
                onClick={cancelInvoice}
                disabled={busy}
                className="focus-ring rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                Cancel invoice
              </button>
            )}
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
            {error}
          </p>
        )}

        <div className="overflow-hidden rounded-xl border border-[var(--color-border)]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-muted)] text-xs uppercase tracking-wide text-[var(--color-muted-fg)]">
                <th scope="col" className="px-4 py-2.5 font-semibold">{isPharmacy ? "Drug" : "Description"}</th>
                <th scope="col" className="px-4 py-2.5 text-right font-semibold">Qty</th>
                <th scope="col" className="px-4 py-2.5 text-right font-semibold">Unit</th>
                {!isPharmacy && <th scope="col" className="px-4 py-2.5 text-right font-semibold">VAT</th>}
                <th scope="col" className="px-4 py-2.5 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {invoice.invoice_items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-2.5 font-medium text-[var(--color-foreground)]">{item.description}</td>
                  <td className="px-4 py-2.5 text-right text-[var(--color-muted-fg)]">{item.quantity}</td>
                  <td className="px-4 py-2.5 text-right text-[var(--color-muted-fg)]">{ngn(Number(item.unit_price))}</td>
                  {!isPharmacy && <td className="px-4 py-2.5 text-right text-[var(--color-muted-fg)]">{Number(item.vat_amount).toFixed(2)}</td>}
                  <td className="px-4 py-2.5 text-right font-semibold">{ngn(Number(item.total_price))}</td>
                </tr>
              ))}
              <tr className="bg-[var(--color-muted)]/40 text-sm font-bold">
                <td colSpan={isPharmacy ? 3 : 4} className="px-4 py-2.5 text-right text-[var(--color-muted-fg)]">
                  Subtotal {ngn(Number(invoice.subtotal))} · Tax {ngn(Number(invoice.tax_amount))} · Discount {ngn(Number(invoice.discount_amount))}
                </td>
                <td className="px-4 py-2.5 text-right text-[var(--color-foreground)]">{ngn(Number(invoice.total_amount))}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Payments */}
        <section>
          <h3 className="mb-2 text-sm font-semibold text-[var(--color-foreground)]">
            Payments · Paid {ngn(Number(invoice.paid_amount))} of {ngn(Number(invoice.total_amount))}
          </h3>
          {completed.length > 0 && (
            <ul className="mb-2 space-y-1.5">
              {completed.map((p) => (
                <li key={p.id} className="flex justify-between rounded-lg bg-emerald-50 px-3 py-2 text-sm">
                  <span className="font-medium text-emerald-800">{p.reference ?? "—"} · {p.payment_method.replace(/_/g, " ")}</span>
                  <span className="font-semibold text-emerald-700">{ngn(Number(p.amount))}</span>
                </li>
              ))}
            </ul>
          )}
          {pending.length > 0 && (
            <ul className="mb-2 space-y-1.5">
              {pending.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm">
                  <span className="font-medium text-amber-800">{p.reference ?? "—"} · declared {p.payment_method.replace(/_/g, " ")} · {ngn(Number(p.amount))}</span>
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700">
                    Awaiting confirmation
                  </span>
                </li>
              ))}
            </ul>
          )}

          {isPharmacy ? (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/30 p-4 text-sm text-[var(--color-muted-fg)]">
              Pharmacy sale payments are recorded in the Pharmacy → Billing page. Use the PDF button to print or save this bill.
            </div>
          ) : !viewOnly && outstanding > 0 && invoice.status !== "cancelled" ? (
            <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/30 p-4">
              <div>
                <label className={labelCls} htmlFor="r-amount">Amount</label>
                <input
                  id="r-amount"
                  type="number"
                  min={0}
                  step="0.01"
                  max={outstanding}
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className={`${inputCls} w-36`}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="r-method">Method</label>
                <select id="r-method" value={method} onChange={(e) => setMethod(e.target.value)} className={`${inputCls} w-40`}>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="transfer">Transfer</option>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="pos">POS</option>
                  <option value="mobile_money">Mobile money</option>
                  <option value="insurance">Insurance</option>
                  <option value="bank_deposit">Bank deposit</option>
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="r-account">Receipt into</label>
                <select id="r-account" value={account} onChange={(e) => setAccount(e.target.value)} className={`${inputCls} w-44`}>
                  <option value="cash">Cash</option>
                  {bankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>{b.bank_name} • {b.account_name}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={recordPayment}
                disabled={busy}
                className="focus-ring rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {busy ? "Recording…" : "Record payment"}
              </button>
              <p className="w-full text-xs text-[var(--color-muted-fg)]">
                Outstanding: {ngn(outstanding)}
              </p>
            </div>
          ) : null}
        </section>
      </div>
    </ModalShell>
  );
}

function ModalShell({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className={`my-4 w-full rounded-2xl bg-white p-6 shadow-2xl ${wide ? "max-w-2xl" : "max-w-md"}`}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="focus-ring rounded-lg p-2 text-[var(--color-muted-fg)] hover:bg-slate-100" aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}