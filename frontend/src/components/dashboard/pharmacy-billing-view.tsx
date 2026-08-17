"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Receipt, Wallet, FileText, ShieldCheck, Printer, Plus, X, Search, CheckCircle2, Clock, Banknote,
} from "lucide-react";
import ImportExportMenu from "@/components/ui/import-export-menu";
import DateRangeBar from "@/components/filters/date-range-bar";
import type { ImportResult } from "@/components/ui/csv-import-modal";
import { dateStamp, downloadCsv, printTable } from "@/lib/export";
import { inDateRange } from "@/lib/daterange";
import { useTenantBranding } from "@/lib/use-tenant-branding";
import type { AccessLevel } from "@/lib/nav";

// ============================================================================
// Pharmacy Billing â€” sales invoices, multi-method payments, insurance claims,
// formulary coverage rules and the daily sales report.
// ============================================================================

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
const btnPrimary =
  "focus-ring inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60";
const btnGhost =
  "focus-ring inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-muted-fg)] transition-colors duration-200 hover:bg-slate-50 disabled:opacity-60";
const ngn = (v: number | null | undefined) => `â‚¦${Number(v ?? 0).toLocaleString()}`;

type Tab = "sales" | "payments" | "claims" | "coverage" | "report";

const TABS: Array<{ id: Tab; label: string; icon: typeof Receipt }> = [
  { id: "sales", label: "Sales", icon: Receipt },
  { id: "payments", label: "Payments", icon: Wallet },
  { id: "claims", label: "Claims", icon: FileText },
  { id: "coverage", label: "Formulary", icon: ShieldCheck },
  { id: "report", label: "Daily report", icon: Banknote },
];

export default function PharmacyBillingView({ accessLevel = "full", myRole }: { accessLevel?: AccessLevel; myRole?: string }) {
  const viewOnly = accessLevel === "view_only";
  const [tab, setTab] = useState<Tab>("sales");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[var(--color-foreground)]">Pharmacy billing</h2>
          <p className="mt-0.5 text-sm text-[var(--color-muted-fg)]">
            Sales invoices, split payments, insurance claims and daily revenue.
          </p>
        </div>
        <div className="flex gap-2" role="group" aria-label="Billing section">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-pressed={tab === t.id}
              className={`focus-ring inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors duration-200 ${
                tab === t.id ? "bg-[var(--color-primary)] text-white" : "border border-[var(--color-border)] text-[var(--color-muted-fg)] hover:bg-slate-50"
              }`}
            >
              <t.icon size={14} aria-hidden="true" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "sales" && <SalesTab viewOnly={viewOnly} />}
      {tab === "payments" && <PaymentsTab viewOnly={viewOnly} />}
      {tab === "claims" && <ClaimsTab viewOnly={viewOnly} />}
      {tab === "coverage" && <CoverageTab viewOnly={viewOnly} />}
      {tab === "report" && <ReportTab viewOnly={viewOnly} />}
    </div>
  );
}

async function fetchAll<T>(url: string): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= 10; page++) {
    const sep = url.includes("?") ? "&" : "?";
    const res = await fetch(`${url}${sep}page=${page}&pageSize=100`, { cache: "no-store" });
    if (!res.ok) break;
    const body = await res.json();
    const data = (body.data ?? []) as T[];
    out.push(...data);
    if (data.length < 100) break;
  }
  return out;
}

function statusBadge(status: string): string {  switch (status) {
    case "paid": return "bg-emerald-100 text-emerald-700";
    case "partial": return "bg-amber-100 text-amber-700";
    case "unpaid": return "bg-red-100 text-red-700";
    case "cancelled": return "bg-slate-100 text-slate-600";
    case "refunded": return "bg-indigo-100 text-indigo-700";
    case "draft": return "bg-sky-100 text-sky-700";
    case "pending": return "bg-amber-100 text-amber-700";
    case "approved": return "bg-emerald-100 text-emerald-700";
    case "rejected": return "bg-red-100 text-red-700";
    default: return "bg-slate-100 text-slate-600";
  }
}

function Badge({ value }: { value: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusBadge(value)}`}>
      {value}
    </span>
  );
}

// ---------------------------------------------------------------------------
// SALES TAB
// ---------------------------------------------------------------------------
interface InvoiceRow {
  id: string;
  invoice_number: string;
  source: string;
  status: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  insurance_claimable: boolean;
  created_at: string;
  patients: { patient_number: string; first_name: string; last_name: string } | null;
  pharmacy_invoice_items?: Array<{ id: string; drug_name: string; quantity: number; unit_price: number; total_price: number }>;
}

interface DrugOption { id: string; name: string; unitPrice: number; dosage: string | null; inStock: number; priceSource?: "branch_override" | "base_override" | "catalog" | "wholesale" }
interface PatientOption { id: string; label: string }

function SalesTab({ viewOnly = false }: { viewOnly?: boolean }) {
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [detail, setDetail] = useState<InvoiceRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ pageSize: "50" });
      if (status) params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      const res = await fetch(`/api/pharmacy/invoices?${params.toString()}`, { cache: "no-store" });
      if (res.ok) setRows((await res.json()).data ?? []);
    } finally {
      setLoading(false);
    }
  }, [status, q, fromDate, toDate]);

  useEffect(() => { void load(); }, [load]);

  async function fetchDetail(id: string) {
    const res = await fetch(`/api/pharmacy/invoices/${id}`, { cache: "no-store" });
    if (res.ok) setDetail((await res.json()).data);
  }

  const SALES_COLUMNS = [
    "invoice_number", "patient_number", "patient_name", "source", "subtotal",
    "discount", "tax", "total_amount", "paid_amount", "status", "created_at",
  ];

  const salesRows = () =>
    rows.map((r) => [
      r.invoice_number,
      r.patients?.patient_number ?? "",
      r.patients ? `${r.patients.first_name} ${r.patients.last_name}` : "",
      r.source,
      r.subtotal,
      r.discount_amount,
      r.tax_amount,
      r.total_amount,
      r.paid_amount,
      r.status,
      r.created_at,
    ]);

  function exportCsv() {
    if (rows.length === 0) { alert("Nothing to export â€” there are no sales yet."); return; }
    downloadCsv(`pharmacy-sales-${dateStamp()}.csv`, SALES_COLUMNS, salesRows());
  }

  function exportPdf() {
    if (rows.length === 0) { alert("Nothing to export â€” there are no sales yet."); return; }
    printTable("Pharmacy Sales", SALES_COLUMNS, salesRows());
  }

  const visible = rows.filter((r) => inDateRange(r.created_at, fromDate, toDate));

  async function importSales(_rows: string[][]): Promise<ImportResult> {
    return {
      created: 0,
      failed: 0,
      errors: ["Sales are recorded through the New sale workflow (they require prescription/stock items) and cannot be imported."],
    };
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search invoice, patient, drugâ€¦"
          aria-label="Search pharmacy sales"
          className={`${inputCls} w-56`}
        />
        <DateRangeBar
          from={fromDate}
          to={toDate}
          onFromChange={setFromDate}
          onToChange={setToDate}
          onClear={() => { setFromDate(""); setToDate(""); }}
        />
        <div className="flex-1" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputCls} w-auto`}>
          <option value="">All statuses</option>
          <option value="unpaid">Unpaid</option>
          <option value="partial">Partial</option>
          <option value="paid">Paid</option>
        </select>
        <ImportExportMenu
          entityLabel="Pharmacy Sales"
          exportCsv={exportCsv}
          exportPdf={exportPdf}
          importColumns={SALES_COLUMNS}
          templateFilename="pharmacy-sales-import-template.csv"
          onImport={importSales}
          allowImport={!viewOnly}
        />
        {!viewOnly && (
        <>
        <button type="button" onClick={() => setConvertOpen(true)} className={btnGhost}>
          <FileText size={14} aria-hidden="true" /> Convert prescription
        </button>
        <button type="button" onClick={() => setOpen(true)} className={btnPrimary}>
          <Plus size={14} aria-hidden="true" /> New sale
        </button>
        </>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-muted)] text-xs uppercase tracking-wide text-[var(--color-muted-fg)]">
              <th scope="col" className="px-4 py-2.5 font-semibold">Invoice</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Patient</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Source</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Total</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Paid</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Status</th>
              <th scope="col" className="px-4 py-2.5 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-xs text-[var(--color-muted-fg)]">Loadingâ€¦</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-xs text-[var(--color-muted-fg)]">No pharmacy sales yet.</td></tr>
            ) : (
              visible.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-[var(--color-foreground)]">{r.invoice_number}</td>
                  <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">
                    {r.patients ? `${r.patients.first_name} ${r.patients.last_name}` : "â€”"}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-muted-fg)] capitalize">{r.source}</td>
                  <td className="px-4 py-2.5 font-semibold">{ngn(r.total_amount)}</td>
                  <td className="px-4 py-2.5 text-emerald-600">{ngn(r.paid_amount)}</td>
                  <td className="px-4 py-2.5"><Badge value={r.status} /></td>
                  <td className="px-4 py-2.5 text-right">
                    <button type="button" onClick={() => { setDetail(null); void fetchDetail(r.id); }} className={btnGhost}>
                      <Receipt size={13} aria-hidden="true" /> View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {open && <NewSaleModal onClose={() => setOpen(false)} onSaved={() => { setOpen(false); void load(); }} />}
      {convertOpen && <ConvertSaleModal onClose={() => setConvertOpen(false)} onSaved={() => { setConvertOpen(false); void load(); }} />}
      {detail && <InvoiceDetail invoice={detail} onClose={() => setDetail(null)} onChanged={() => { void fetchDetail(detail.id); void load(); }} viewOnly={viewOnly} />}
    </div>
  );
}

function NewSaleModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [items, setItems] = useState<Array<{ drugId: string; name: string; qty: string; price: string; priceSource?: DrugOption["priceSource"] }>>([]);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [patientId, setPatientId] = useState("");
  const [discount, setDiscount] = useState("");
  const [taxRate, setTaxRate] = useState("");
  const [claimable, setClaimable] = useState(false);
  const [dispense, setDispense] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DrugOption[]>([]);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/patients?limit=30", { cache: "no-store" });
      if (res.ok) {
        const body = await res.json();
        setPatients((body.data ?? []).map((p: { id: string; first_name: string; last_name: string; patient_number?: string }) => ({
          id: p.id,
          label: `${p.first_name} ${p.last_name}${p.patient_number ? ` (${p.patient_number})` : ""}`,
        })));
      }
    })();
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/pharmacy/drugs?query=${encodeURIComponent(query)}`, { cache: "no-store" });
      if (res.ok) setResults((await res.json()).data ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  function addItem(d: DrugOption) {
    setItems((prev) => [...prev, { drugId: d.id, name: d.name, qty: "1", price: String(d.unitPrice ?? ""), priceSource: d.priceSource }]);
    setQuery("");
    setResults([]);
  }

  function priceSourceChip(source?: DrugOption["priceSource"]) {
    if (source === "branch_override") {
      return (
        <span className="ml-2 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700" title="This branch's price override applies to this drug">
          Branch price
        </span>
      );
    }
    if (source === "base_override") {
      return (
        <span className="ml-2 inline-block rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700" title='"All branches" price override applies to this drug'>
          All-branch price
        </span>
      );
    }
    return null;
  }

  function removeItem(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  function setItem(i: number, key: "qty" | "price", v: string) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [key]: v } : it)));
  }

  const subtotal = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
  const disc = Number(discount) || 0;
  const taxable = subtotal - disc;
  const tax = (Number(taxRate) || 0) > 0 ? (taxable * (Number(taxRate) || 0)) / 100 : 0;
  const total = Math.max(0, taxable + tax);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (items.length === 0) throw new Error("Add at least one drug");

      // Pre-flight: verify dispensable stock for the whole basket BEFORE the
      // invoice exists, so shortages block the sale cleanly instead of
      // recording a sale whose stock cannot move.
      if (dispense) {
        const shortages: string[] = [];
        for (const it of items) {
          const inv = await fetch(`/api/pharmacy/inventory/${it.drugId}`, { cache: "no-store" });
          if (inv.ok) {
            const invBody = await inv.json();
            const avail = Number(invBody.data?.totals?.dispensableStock ?? 0);
            const need = Math.floor(Number(it.qty) || 1);
            if (avail < need) {
              shortages.push(`${it.name}: have ${avail}, need ${need}`);
            }
          }
        }
        if (shortages.length > 0) {
          throw new Error(`Insufficient stock â€” ${shortages.join(" Â· ")}`);
        }
      }

      const res = await fetch("/api/pharmacy/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "counter",
          patientId: patientId || null,
          items: items.map((it) => ({ drugId: it.drugId, quantity: Number(it.qty) || 1, unit_price: Number(it.price) || null })),
          discount: disc || undefined,
          taxRate: Number(taxRate) || undefined,
          claimable,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to create invoice");

      if (dispense) {
        // Dispense every item. A failure here is a race (stock changed after
        // the pre-flight) â€” cancel the invoice so we never keep a sale whose
        // stock did not move, then surface exactly what went wrong.
        const failed: Array<{ name: string; reason: string }> = [];
        for (const it of items) {
          const disp = await fetch("/api/pharmacy/dispense", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ drugId: it.drugId, quantity: Number(it.qty) || 1, sourceRef: body.data?.invoice_number ?? undefined }),
          });
          const dBody = await disp.json();
          if (!disp.ok) failed.push({ name: it.name, reason: dBody.error ?? "dispensing failed" });
        }
        if (failed.length > 0) {
          let cancelled = false;
          if (body.data?.id) {
            const del = await fetch(`/api/pharmacy/invoices/${body.data.id}`, { method: "DELETE" });
            cancelled = del.ok;
          }
          const detail = failed.map((f) => `${f.name}: ${f.reason}`).join(" Â· ");
          throw new Error(
            cancelled
              ? `Sale cancelled â€” dispense failed: ${detail}`
              : `Dispense failed: ${detail} â€” invoice ${body.data?.invoice_number ?? ""} was KEPT, please review it`
          );
        }
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create invoice");
    } finally {
      setBusy(false);
    }
  }

  const lbl = "mb-1 block text-xs font-medium text-[var(--color-foreground)]";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="my-4 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">New counter sale</h3>
          <button type="button" onClick={onClose} className="focus-ring rounded-lg p-2 text-[var(--color-muted-fg)] hover:bg-slate-100" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={lbl} htmlFor="ns-patient">Patient (optional)</label>
            <select id="ns-patient" value={patientId} onChange={(e) => setPatientId(e.target.value)} className={inputCls}>
              <option value="">Walk-in / no patient</option>
              {patients.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className={lbl} htmlFor="ns-disc">Discount (â‚¦)</label>
              <input id="ns-disc" type="number" min={0} value={discount} onChange={(e) => setDiscount(e.target.value)} className={inputCls} />
            </div>
            <div className="w-28">
              <label className={lbl} htmlFor="ns-tax">Tax %</label>
              <input id="ns-tax" type="number" min={0} value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className={inputCls} />
            </div>
            <label className="flex items-center gap-1.5 pb-2 text-xs text-[var(--color-muted-fg)]">
              <input type="checkbox" checked={dispense} onChange={(e) => setDispense(e.target.checked)} className="accent-[var(--color-primary)]" />
              Dispense stock
            </label>
            <label className="flex items-center gap-1.5 pb-2 text-xs text-[var(--color-muted-fg)]">
              <input type="checkbox" checked={claimable} onChange={(e) => setClaimable(e.target.checked)} className="accent-[var(--color-primary)]" />
              Claimable
            </label>
          </div>
        </div>

        <div className="mt-4">
          <label className={lbl} htmlFor="ns-drug">Add drugs</label>
          <div className="relative">
            <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-3 top-3 text-[var(--color-muted-fg)]" />
            <input
              id="ns-drug"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the catalogueâ€¦"
              className={`${inputCls} pl-9`}
            />
          </div>
          {results.length > 0 && (
            <ul className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-white shadow-lg">
              {results.map((d) => (
                <li key={d.id}>
                  <button type="button" onClick={() => addItem(d)} className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-primary-soft)]">
                    <span className="block font-medium">{d.name}</span>
                    <span className="block text-xs text-[var(--color-muted-fg)]">
                      {[d.dosage, `â‚¦${Number(d.unitPrice ?? 0).toLocaleString()}`].filter(Boolean).join(" Â· ")}
                      {d.priceSource === "branch_override" && (
                        <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-700">branch price</span>
                      )}
                      {d.priceSource === "base_override" && (
                        <span className="ml-1 rounded bg-sky-100 px-1 py-0.5 text-[10px] font-semibold text-sky-700">all-branch price</span>
                      )}
                      {Number(d.inStock ?? 0) > 0 ? (
                        <span className="ml-1 font-semibold text-emerald-600">{Number(d.inStock)} in stock</span>
                      ) : (
                        <span className="ml-1 font-semibold text-red-500">out of stock</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--color-border)]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-muted)] text-xs uppercase text-[var(--color-muted-fg)]">
                  <th className="px-3 py-2 font-semibold">Drug</th>
                  <th className="px-3 py-2 font-semibold w-20">Qty</th>
                  <th className="px-3 py-2 font-semibold w-28">Unit price</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {items.map((it, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2">
                      <span className="flex items-center text-[var(--color-foreground)]">
                        {it.name}
                        {priceSourceChip(it.priceSource)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" min={1} value={it.qty} onChange={(e) => setItem(i, "qty", e.target.value)} className={`${inputCls} px-2 py-1`} />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" min={0} value={it.price} onChange={(e) => setItem(i, "price", e.target.value)} className={`${inputCls} px-2 py-1`} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => removeItem(i)} className="focus-ring rounded-lg p-1.5 text-[var(--color-muted-fg)] hover:bg-red-50 hover:text-red-600" aria-label="Remove">
                        <X size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-4 text-sm">
          <span className="text-[var(--color-muted-fg)]">Subtotal {ngn(subtotal)}</span>
          {disc > 0 && <span className="text-red-500">âˆ’{ngn(disc)}</span>}
          <span className="text-xl font-bold">{ngn(total)}</span>
        </div>

        {error && <p role="alert" className="mt-3 rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">{error}</p>}

        <div className="mt-5 flex gap-3">
          <button type="button" onClick={onClose} className={btnGhost + " flex-1 justify-center py-2.5"}>Cancel</button>
          <button type="button" onClick={submit} disabled={busy || items.length === 0} className={btnPrimary + " flex-1 justify-center py-2.5"}>
            {busy ? "Creatingâ€¦" : "Create invoice"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CONVERT PRESCRIPTION â†’ SALE
// Pharmacy staff pick a pending prescription and decide the channel:
//   in-house patient  â†’ stock issued, invoice in the patient's name, payment
//                       left outstanding on their account, prescription closed.
//   walk-in customer  â†’ stock issued, invoice raised, cash/transfer collected
//                       NOW (bank ledger credited), prescription closed.
//   external pharmacy â†’ no stock, no invoice: prescription closed and the
//                       patient gets Internal Mail with the medication list.
// ---------------------------------------------------------------------------
interface RxCandidate {
  id: string;
  patient_id: string | null;
  status: string;
  pharmacy_type: string;
  external_pharmacy_name: string | null;
  issued_date: string;
  created_at: string;
  patients: { patient_number: string; first_name: string; last_name: string } | null;
  prescription_items: Array<{ pharmacy_drug_id: string | null; medication_name: string | null; quantity: number; dispensed_qty: number }>;
}

type ConvertChannel = "in_house" | "walk_in" | "external";

const CHANNELS: Array<{ id: ConvertChannel; label: string; hint: string }> = [
  { id: "in_house", label: "In-house patient", hint: "Stock issued Â· invoice in patient's name Â· payment tracked as outstanding" },
  { id: "walk_in", label: "Walk-in customer", hint: "Stock issued Â· invoice raised Â· cash/transfer collected now, bank ledger credited" },
  { id: "external", label: "External pharmacy", hint: "No stock, no invoice Â· prescription closed Â· patient mailed the medication list" },
];

function ConvertSaleModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [rxs, setRxs] = useState<RxCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [channel, setChannel] = useState<ConvertChannel>("in_house");
  const [method, setMethod] = useState("cash");
  const [bankAccounts, setBankAccounts] = useState<Array<{ id: string; label: string }>>([]);
  const [bankAccountId, setBankAccountId] = useState("cash");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ summary: string; invoiceNumber?: string | null } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [rxRes, bankRes] = await Promise.all([
          fetch("/api/prescriptions?pageSize=100", { cache: "no-store" }),
          fetch("/api/settings/bank-accounts", { cache: "no-store" }),
        ]);
        if (rxRes.ok) {
          const body = await rxRes.json();
          const all = (body.data ?? []) as RxCandidate[];
          setRxs(
            all.filter(
              (r) =>
                ["pending", "processing", "partial"].includes(r.status) &&
                (r.prescription_items ?? []).some((i) => Math.floor(Number(i.quantity) || 0) - Math.floor(Number(i.dispensed_qty) || 0) > 0)
            )
          );
        }
        if (bankRes.ok) {
          const body = await bankRes.json();
          const accounts = (body.data ?? []).map((a: { id: string; bank_name: string; account_name: string }) => ({
            id: a.id,
            label: `${a.bank_name} â€” ${a.account_name}`,
          }));
          setBankAccounts(accounts);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const selected = rxs.find((r) => r.id === selectedId) ?? null;
  const remainingOf = (r: RxCandidate) =>
    (r.prescription_items ?? []).reduce(
      (s, i) => s + Math.max(0, Math.floor(Number(i.quantity) || 0) - Math.floor(Number(i.dispensed_qty) || 0)),
      0
    );
  const itemNames = (r: RxCandidate) =>
    (r.prescription_items ?? [])
      .map((i) => i.medication_name ?? "item")
      .filter(Boolean)
      .join(", ");

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (!selectedId) throw new Error("Pick a prescription to convert");
      const rx = rxs.find((r) => r.id === selectedId);
      if (!rx) throw new Error("Prescription not found");

      const res = await fetch(`/api/prescriptions/${selectedId}/convert-sale`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, notes: notes.trim() || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Conversion failed");

      if (channel === "walk_in") {
        if (!body.data?.invoice?.id) throw new Error("Invoice was not created for the walk-in sale");
        const payRes = await fetch("/api/pharmacy/payments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invoiceId: body.data.invoice.id,
            payments: [{ method, amount: Number(body.data.invoice.total_amount) }],
            bankAccountId: bankAccountId || null,
          }),
        });
        const payBody = await payRes.json();
        if (!payRes.ok) throw new Error(`Payment failed: ${payBody.error ?? "unknown error"}`);
        setDone({
          summary: `Walk-in sale completed â€” invoice ${body.data.invoice.invoice_number}, ${method.toUpperCase()} payment of â‚¦${Number(
            body.data.invoice.total_amount
          ).toLocaleString()} recorded to ${bankAccountId === "cash" ? "the cash ledger" : "the bank ledger"}.`,
          invoiceNumber: body.data.invoice.invoice_number,
        });
      } else if (channel === "in_house") {
        setDone({
          summary: `Sale closed for ${rx.patients ? `${rx.patients.first_name} ${rx.patients.last_name}` : "the patient"} â€” stock issued, invoice ${
            body.data?.invoice?.invoice_number ?? ""
          } raised and left outstanding on the patient's account.`,
          invoiceNumber: body.data?.invoice?.invoice_number ?? null,
        });
      } else {
        setDone({
          summary: `Prescription closed as an external-pharmacy sale${rx.external_pharmacy_name ? ` (${rx.external_pharmacy_name})` : ""} â€” the patient was mailed the medication list to buy out-of-house.`,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Conversion failed");
    } finally {
      setBusy(false);
    }
  }

  const lbl = "mb-1 block text-xs font-medium text-[var(--color-foreground)]";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="my-4 w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">Convert prescription to sale</h3>
          <button type="button" onClick={onClose} className="focus-ring rounded-lg p-2 text-[var(--color-muted-fg)] hover:bg-slate-100" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {done ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              <p className="flex items-center gap-2 font-semibold"><CheckCircle2 size={16} /> Conversion complete</p>
              <p className="mt-1 whitespace-pre-line">{done.summary}</p>
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={onSaved} className={btnPrimary + " px-6 py-2.5"}>Done</button>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-4">
              <label className={lbl}>1. Choose the prescription</label>
              {loading ? (
                <p className="rounded-lg border border-[var(--color-border)] p-4 text-center text-xs text-[var(--color-muted-fg)]">Loading prescriptionsâ€¦</p>
              ) : rxs.length === 0 ? (
                <p className="rounded-lg border border-[var(--color-border)] p-4 text-center text-xs text-[var(--color-muted-fg)]">
                  No pending prescriptions waiting for conversion.
                </p>
              ) : (
                <ul className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-[var(--color-border)] p-1.5">
                  {rxs.map((r) => {
                    const isSel = selectedId === r.id;
                    const remaining = remainingOf(r);
                    return (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(r.id)}
                          className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                            isSel ? "bg-[var(--color-primary-soft)] ring-1 ring-[var(--color-primary)]" : "hover:bg-slate-50"
                          }`}
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className="font-medium text-[var(--color-foreground)]">
                              {r.patients ? `${r.patients.first_name} ${r.patients.last_name}` : "Unnamed patient"}
                              {r.patients?.patient_number ? ` (${r.patients.patient_number})` : ""}
                            </span>
                            <span className="flex items-center gap-1.5">
                              <Badge value={r.status} />
                              <Badge value={r.pharmacy_type === "external" ? "external" : "in-house"} />
                            </span>
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-[var(--color-muted-fg)]">
                            Issued {new Date(r.issued_date ?? r.created_at).toLocaleDateString()} Â· {itemNames(r)} Â· {remaining} item(s) remaining
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="mt-4">
              <label className={lbl}>2. Sale channel â€” how is this being fulfilled?</label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {CHANNELS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setChannel(c.id)}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      channel === c.id
                        ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]"
                        : "border-[var(--color-border)] hover:bg-slate-50"
                    }`}
                  >
                    <span className="block text-sm font-semibold text-[var(--color-foreground)]">{c.label}</span>
                    <span className="mt-1 block text-xs leading-snug text-[var(--color-muted-fg)]">{c.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            {channel === "walk_in" && (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={lbl} htmlFor="cs-method">Payment method</label>
                  <select id="cs-method" value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>
                    <option value="cash">Cash</option>
                    <option value="transfer">Bank transfer</option>
                    <option value="pos">POS</option>
                    <option value="card">Card</option>
                  </select>
                </div>
                <div>
                    <label className={lbl} htmlFor="cs-bank">Deposit into</label>
                    <select id="cs-bank" value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} className={inputCls}>
                      <option value="cash">Cash</option>
                      {bankAccounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.label}</option>
                      ))}
                    </select>
                  </div>
              </div>
            )}

            {channel === "external" && selected?.external_pharmacy_name && (
              <p className="mt-4 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">
                Patient was routed to <strong>{selected.external_pharmacy_name}</strong> â€” closing sends them the medication list via Internal Mail.
              </p>
            )}

            <div className="mt-4">
              <label className={lbl} htmlFor="cs-notes">Notes (optional)</label>
              <input id="cs-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. urgent, collected same day, dosage instructionsâ€¦" className={inputCls} />
            </div>

            {error && <p role="alert" className="mt-3 rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">{error}</p>}

            <div className="mt-5 flex gap-3">
              <button type="button" onClick={onClose} className={btnGhost + " flex-1 justify-center py-2.5"}>Cancel</button>
              <button type="button" onClick={submit} disabled={busy || rxs.length === 0 || !selectedId} className={btnPrimary + " flex-1 justify-center py-2.5"}>
                {busy ? "Convertingâ€¦" : "Convert to sale"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// INVOICE DETAIL + PAYMENTS
// ---------------------------------------------------------------------------
function InvoiceDetail({ invoice, onClose, onChanged, viewOnly = false }: { invoice: InvoiceRow; onClose: () => void; onChanged: () => void; viewOnly?: boolean }) {
  const [payments, setPayments] = useState<Array<{ id: string; method: string; amount: number; reference: string | null; received_at: string }>>([]);
  const [splits, setSplits] = useState<Array<{ method: string; amount: string; reference: string }>>([{ method: "cash", amount: "", reference: "" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { branding } = useTenantBranding();

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/pharmacy/payments?invoiceId=${invoice.id}`, { cache: "no-store" });
      if (res.ok) setPayments((await res.json()).data ?? []);
    })();
  }, [invoice.id]);

  const outstanding = Number(invoice.total_amount) - Number(invoice.paid_amount ?? 0);

  function setSplit(i: number, key: "method" | "amount" | "reference", v: string) {
    setSplits((prev) => prev.map((s, idx) => (idx === i ? { ...s, [key]: v } : s)));
  }

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      const valid = splits.filter((s) => Number(s.amount) > 0);
      if (valid.length === 0) throw new Error("Enter at least one amount");
      const res = await fetch("/api/pharmacy/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: invoice.id,
          payments: valid.map((s) => ({ method: s.method, amount: Number(s.amount), reference: s.reference.trim() || undefined })),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Payment failed");
      setSplits([{ method: "cash", amount: "", reference: "" }]);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  const remaining = outstanding - splits.reduce((s, x) => s + (Number(x.amount) || 0), 0);

  const print = () => {
    const w = window.open("", "_blank", "width=420,height=640");
    if (!w) return;
    const esc = (v: unknown) =>
      String(v ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    const name = esc(branding?.name ?? "Pharmacy");
    const address = esc(
      [branding?.address, [branding?.city, branding?.state].filter(Boolean).join(", "), branding?.country]
        .filter(Boolean)
        .join(", ")
    );
    const contact = esc(
      [
        branding?.phone && `Tel: ${branding.phone}`,
        branding?.email && `Email: ${branding.email}`,
        branding?.website,
      ]
        .filter(Boolean)
        .join(" â€¢ ")
    );
    const letterhead = `
      <div style="display:flex;align-items:center;gap:10px;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:10px;">
        ${branding?.logo_url ? `<img src="${esc(branding.logo_url)}" alt="logo" style="width:44px;height:44px;object-fit:contain;" />` : ""}
        <div>
          <p style="margin:0;font-size:14px;font-weight:bold;">${name}</p>
          ${address ? `<p class="muted" style="margin:1px 0 0;">${address}</p>` : ""}
          ${contact ? `<p class="muted" style="margin:1px 0 0;">${contact}</p>` : ""}
        </div>
      </div>`;
    w.document.write(`<html><head><title>${esc(invoice.invoice_number)}</title><style>
      body{font-family:ui-monospace,monospace;font-size:12px;padding:16px;max-width:320px;margin:auto}
      h1{font-size:14px;margin:0 0 4px} .muted{color:#666} .row{display:flex;justify-content:space-between;margin:2px 0}
      table{width:100%;border-collapse:collapse;margin-top:8px} td{padding:3px 0;border-bottom:1px dashed #ccc}
      .tot{border-top:2px solid #000;margin-top:6px;padding-top:6px}
    </style></head><body>
      ${letterhead}
      <h1>${esc(invoice.invoice_number)}</h1>
      <p class="muted">${new Date(invoice.created_at).toLocaleString()}<br>${invoice.patients ? `${esc(`${invoice.patients.first_name} ${invoice.patients.last_name}`)}` : "Walk-in"}</p>
      <table><tbody>
        ${(invoice.pharmacy_invoice_items ?? []).map((it) => `<tr><td>${esc(it.drug_name)}</td><td>${it.quantity} Ã— ${ngn(it.unit_price)}</td><td>${ngn(it.total_price)}</td></tr>`).join("")}
      </tbody></table>
      <div class="tot">
        <div class="row"><span>Subtotal</span><span>${ngn(invoice.subtotal)}</span></div>
        ${Number(invoice.discount_amount) > 0 ? `<div class="row"><span>Discount</span><span>âˆ’${ngn(invoice.discount_amount)}</span></div>` : ""}
        <div class="row"><span>Tax</span><span>${ngn(invoice.tax_amount)}</span></div>
        <div class="row" style="font-weight:bold;font-size:14px"><span>TOTAL</span><span>${ngn(invoice.total_amount)}</span></div>
        <div class="row"><span>Paid</span><span>${ngn(invoice.paid_amount)}</span></div>
      </div>
      <p style="margin-top:20px;text-align:center" class="muted">Thank you for your patronage!</p>
    </body></html>`);
    w.document.close();
    w.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold">{invoice.invoice_number}</h3>
            <p className="text-xs text-[var(--color-muted-fg)]">
              {invoice.patients ? `${invoice.patients.first_name} ${invoice.patients.last_name} (${invoice.patients.patient_number})` : "Walk-in"} Â· {new Date(invoice.created_at).toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge value={invoice.status} />
            <button type="button" onClick={print} className={btnGhost}><Printer size={13} aria-hidden="true" /></button>
            <button type="button" onClick={onClose} className="focus-ring rounded-lg p-2 text-[var(--color-muted-fg)] hover:bg-slate-100" aria-label="Close">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--color-border)]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-muted)] text-xs uppercase text-[var(--color-muted-fg)]">
                <th className="px-3 py-2 font-semibold">Item</th>
                <th className="px-3 py-2 font-semibold text-right">Qty</th>
                <th className="px-3 py-2 font-semibold text-right">Unit</th>
                <th className="px-3 py-2 font-semibold text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {(invoice.pharmacy_invoice_items ?? []).map((it) => (
                <tr key={it.id}>
                  <td className="px-3 py-2">{it.drug_name}</td>
                  <td className="px-3 py-2 text-right">{it.quantity}</td>
                  <td className="px-3 py-2 text-right">{ngn(it.unit_price)}</td>
                  <td className="px-3 py-2 text-right font-medium">{ngn(it.total_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between text-[var(--color-muted-fg)]"><span>Subtotal</span><span>{ngn(invoice.subtotal)}</span></div>
          {Number(invoice.discount_amount) > 0 && (
            <div className="flex justify-between text-red-500"><span>Discount</span><span>âˆ’{ngn(invoice.discount_amount)}</span></div>
          )}
          <div className="flex justify-between text-[var(--color-muted-fg)]"><span>Tax</span><span>{ngn(invoice.tax_amount)}</span></div>
          <div className="flex justify-between text-base font-bold"><span>Total</span><span>{ngn(invoice.total_amount)}</span></div>
          <div className="flex justify-between text-emerald-600"><span>Paid</span><span>{ngn(invoice.paid_amount)}</span></div>
          <div className="flex justify-between font-semibold text-[var(--color-foreground)]"><span>Outstanding</span><span>{ngn(Math.max(0, outstanding))}</span></div>
        </div>

        {payments.length > 0 && (
          <div className="mt-4">
            <h4 className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted-fg)]">Payments</h4>
            <ul className="mt-1 space-y-1">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm">
                  <span className="flex items-center gap-2">
                    <Wallet size={13} aria-hidden="true" className="text-[var(--color-muted-fg)]" />
                    <span className="capitalize">{p.method}</span>
                    {p.reference && <span className="text-xs text-[var(--color-muted-fg)]">Â· {p.reference}</span>}
                  </span>
                  <span className="font-semibold text-emerald-600">{ngn(p.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!viewOnly && outstanding > 0.01 && (
          <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-slate-50 p-3">
            <h4 className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted-fg)]">Record payment</h4>
            <div className="mt-2 space-y-2">
              {splits.map((s, i) => (
                <div key={i} className="flex gap-2">
                  <select value={s.method} onChange={(e) => setSplit(i, "method", e.target.value)} className={`${inputCls} w-32 px-2 py-1.5`}>
                    <option value="cash">Cash</option>
                    <option value="pos">POS</option>
                    <option value="transfer">Transfer</option>
                    <option value="card">Card</option>
                    <option value="insurance">Insurance</option>
                  </select>
                  <input type="number" min={0} placeholder="Amount" value={s.amount} onChange={(e) => setSplit(i, "amount", e.target.value)} className={`${inputCls} flex-1 px-2 py-1.5`} />
                  <input placeholder="Ref (optional)" value={s.reference} onChange={(e) => setSplit(i, "reference", e.target.value)} className={`${inputCls} hidden flex-1 px-2 py-1.5 sm:block`} />
                  {splits.length > 1 && (
                    <button type="button" onClick={() => setSplits((prev) => prev.filter((_, idx) => idx !== i))} className="focus-ring rounded-lg px-2 text-[var(--color-muted-fg)] hover:bg-red-50 hover:text-red-600" aria-label="Remove split">
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
              <div className="flex items-center justify-between text-xs text-[var(--color-muted-fg)]">
                <button type="button" onClick={() => setSplits((prev) => [...prev, { method: "cash", amount: "", reference: "" }])} className={btnGhost}>
                  <Plus size={12} aria-hidden="true" /> Split payment
                </button>
                <span className={remaining < -0.01 ? "font-semibold text-red-500" : ""}>
                  Remaining after splits: {ngn(Math.max(0, remaining))}
                </span>
              </div>
            </div>
            {error && <p role="alert" className="mt-2 rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-xs font-medium text-[var(--color-destructive)]">{error}</p>}
            <button type="button" onClick={pay} disabled={busy} className={btnPrimary + " mt-3 w-full justify-center py-2.5"}>
              {busy ? "Recordingâ€¦" : `Take payment (${ngn(splits.reduce((s, x) => s + (Number(x.amount) || 0), 0))})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PAYMENTS TAB
// ---------------------------------------------------------------------------
interface PaymentRow {
  id: string;
  amount: number;
  method: string;
  reference: string | null;
  status: string;
  received_at: string;
  invoice_id: string;
  pharmacy_invoices: { invoice_number: string; patients: { first_name: string; last_name: string } | null } | null;
}

function PaymentsTab({ viewOnly = false }: { viewOnly?: boolean }) {
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [ledger, setLedger] = useState<
    Array<{
      id: string;
      direction: string;
      amount: number;
      source: string;
      method: string | null;
      reference: string | null;
      source_ref: string | null;
      created_at: string;
      hospital_bank_accounts: { bank_name: string; account_name: string; account_number: string } | null;
    }>
  >([]);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [q, setQ] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ pageSize: "100" });
      if (q.trim()) params.set("q", q.trim());
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      const res = await fetch(`/api/pharmacy/payments?${params.toString()}`, { cache: "no-store" });
      if (res.ok) setRows((await res.json()).data ?? []);
    } finally {
      setLoading(false);
    }
  }, [q, fromDate, toDate]);

  useEffect(() => {
    void load();
    (async () => {
      try {
        const res = await fetch("/api/pharmacy/bank-ledger?limit=12", { cache: "no-store" });
        if (res.ok) setLedger((await res.json()).data ?? []);
      } finally {
        setLedgerLoading(false);
      }
    })();
  }, [load]);

  const total = useMemo(() => rows.reduce((s, r) => s + Number(r.amount), 0), [rows]);

  const visible = rows.filter((r) => inDateRange(r.received_at, fromDate, toDate));

  const PAYMENTS_COLUMNS = ["invoice_number", "patient_name", "method", "amount", "reference", "received_at"];

  const paymentsRows = () =>
    rows.map((r) => [
      r.pharmacy_invoices?.invoice_number ?? "",
      r.pharmacy_invoices?.patients ? `${r.pharmacy_invoices.patients.first_name} ${r.pharmacy_invoices.patients.last_name}` : "Walk-in",
      r.method,
      r.amount,
      r.reference ?? "",
      r.received_at,
    ]);

  function exportCsv() {
    if (rows.length === 0) { alert("Nothing to export â€” there are no payments yet."); return; }
    downloadCsv(`pharmacy-payments-${dateStamp()}.csv`, PAYMENTS_COLUMNS, paymentsRows());
  }

  function exportPdf() {
    if (rows.length === 0) { alert("Nothing to export â€” there are no payments yet."); return; }
    printTable("Pharmacy Payments", PAYMENTS_COLUMNS, paymentsRows());
  }

  async function importPayments(rowsIn: string[][]): Promise<ImportResult> {
    const invoices = await fetchAll<{ id: string; invoice_number: string }>("/api/pharmacy/invoices");
    const invMap = new Map<string, string>(invoices.map((i) => [String(i.invoice_number), i.id]));
    const errors: string[] = [];
    let created = 0;
    for (let i = 0; i < rowsIn.length; i++) {
      const r = rowsIn[i]!;
      const invoiceId = invMap.get(String(r[0] ?? "").trim());
      if (!invoiceId) { errors.push(`Row ${i + 1}: unknown invoice number "${r[0] ?? ""}"`); continue; }
      const amount = Number(r[3]);
      if (!Number.isFinite(amount) || amount <= 0) { errors.push(`Row ${i + 1}: invalid amount "${r[3] ?? ""}"`); continue; }
      const res = await fetch("/api/pharmacy/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId,
          payments: [{ method: String(r[2] ?? "cash").trim().toLowerCase() || "cash", amount, reference: String(r[4] ?? "").trim() || undefined }],
        }),
      });
      const body = await res.json();
      if (!res.ok) errors.push(`Row ${i + 1}: ${body.error ?? "payment failed"}`);
      else created++;
    }
    return { created, failed: errors.length, errors };
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search invoice, patient, referenceâ€¦"
          aria-label="Search pharmacy payments"
          className={`${inputCls} w-56`}
        />
        <DateRangeBar
          from={fromDate}
          to={toDate}
          onFromChange={setFromDate}
          onToChange={setToDate}
          onClear={() => { setFromDate(""); setToDate(""); }}
        />
        <div className="flex-1" />
        <ImportExportMenu
          entityLabel="Pharmacy Payments"
          exportCsv={exportCsv}
          exportPdf={exportPdf}
          importColumns={PAYMENTS_COLUMNS}
          importSample={[["PH-INV-0001", "Ada Okafor", "cash", "15000", "REF-1001"]]}
          templateFilename="pharmacy-payments-import-template.csv"
          onImport={importPayments}
          onImported={() => void load()}
          allowImport={!viewOnly}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Transactions" value={rows.length} />
        <Stat label="Collected" value={ngn(total)} tone="ok" />
        <Stat label="Cash" value={ngn(rows.filter((r) => r.method === "cash").reduce((s, r) => s + Number(r.amount), 0))} />
        <Stat label="POS" value={ngn(rows.filter((r) => r.method === "pos").reduce((s, r) => s + Number(r.amount), 0))} />
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--color-border)]">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-muted)] px-4 py-2.5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">Bank ledger â€” money into the bank (latest)</h4>
        </div>
        {ledgerLoading ? (
          <p className="px-4 py-6 text-center text-xs text-[var(--color-muted-fg)]">Loadingâ€¦</p>
        ) : ledger.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-[var(--color-muted-fg)]">
            No bank entries yet â€” cash/transfer/POS payments will be posted here automatically.
          </p>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {ledger.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-[var(--color-foreground)]">
                    {l.direction === "in" ? "+" : "âˆ’"}{ngn(l.amount)}
                    <span className="ml-2 text-xs font-normal uppercase text-[var(--color-muted-fg)]">{l.method ?? l.source}</span>
                  </p>
                  <p className="truncate text-xs text-[var(--color-muted-fg)]">
                    {l.hospital_bank_accounts ? `${l.hospital_bank_accounts.bank_name} (â€¢â€¢ ${l.hospital_bank_accounts.account_number.slice(-4)})` : "No account"} Â· {l.reference ?? l.source_ref ?? "â€”"} Â· {new Date(l.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-muted)] text-xs uppercase tracking-wide text-[var(--color-muted-fg)]">
              <th scope="col" className="px-4 py-2.5 font-semibold">Invoice</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Patient</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Method</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Amount</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Reference</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-[var(--color-muted-fg)]">Loadingâ€¦</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-[var(--color-muted-fg)]">No payments recorded yet.</td></tr>
            ) : (
              visible.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5 font-medium">{r.pharmacy_invoices?.invoice_number ?? "â€”"}</td>
                  <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">
                    {r.pharmacy_invoices?.patients ? `${r.pharmacy_invoices.patients.first_name} ${r.pharmacy_invoices.patients.last_name}` : "Walk-in"}
                  </td>
                  <td className="px-4 py-2.5"><Badge value={r.method} /></td>
                  <td className="px-4 py-2.5 font-semibold text-emerald-600">{ngn(r.amount)}</td>
                  <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{r.reference ?? "â€”"}</td>
                  <td className="px-4 py-2.5 text-xs text-[var(--color-muted-fg)]">{new Date(r.received_at).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CLAIMS TAB
// ---------------------------------------------------------------------------
interface ClaimRow {
  id: string;
  claim_number: string;
  provider_name: string;
  policy_number: string | null;
  claim_amount: number;
  co_pay_amount: number;
  approved_amount: number | null;
  status: string;
  created_at: string;
  pharmacy_invoices: { invoice_number: string; patients: { first_name: string; last_name: string } | null } | null;
}

function ClaimsTab({ viewOnly = false }: { viewOnly?: boolean }) {
  const [rows, setRows] = useState<ClaimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Array<{ id: string; invoice_number: string; total_amount: number }>>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/pharmacy/insurance/claims?pageSize=50", { cache: "no-store" });
      if (res.ok) setRows((await res.json()).data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function process(id: string, status: string, amount?: number) {
    try {
      const res = await fetch(`/api/pharmacy/insurance/claims/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, amount, notes: status === "rejected" ? "Rejected by pharmacy" : undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Update failed");
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  }

  const CLAIMS_COLUMNS = ["claim_number", "invoice_number", "provider", "policy_number", "claim_amount", "co_pay_amount", "approved_amount", "status", "created_at"];

  const claimsRows = () =>
    rows.map((r) => [
      r.claim_number,
      r.pharmacy_invoices?.invoice_number ?? "",
      r.provider_name,
      r.policy_number ?? "",
      r.claim_amount,
      r.co_pay_amount,
      r.approved_amount ?? "",
      r.status,
      r.created_at,
    ]);

  function exportCsv() {
    if (rows.length === 0) { alert("Nothing to export â€” there are no claims yet."); return; }
    downloadCsv(`pharmacy-claims-${dateStamp()}.csv`, CLAIMS_COLUMNS, claimsRows());
  }

  function exportPdf() {
    if (rows.length === 0) { alert("Nothing to export â€” there are no claims yet."); return; }
    printTable("Pharmacy Insurance Claims", CLAIMS_COLUMNS, claimsRows());
  }

  async function importClaims(rowsIn: string[][]): Promise<ImportResult> {
    const invoices = await fetchAll<{ id: string; invoice_number: string }>("/api/pharmacy/invoices");
    const invMap = new Map<string, string>(invoices.map((i) => [String(i.invoice_number), i.id]));
    const errors: string[] = [];
    let created = 0;
    for (let i = 0; i < rowsIn.length; i++) {
      const r = rowsIn[i]!;
      const invoiceId = invMap.get(String(r[1] ?? "").trim());
      if (!invoiceId) { errors.push(`Row ${i + 1}: unknown invoice number "${r[1] ?? ""}"`); continue; }
      if (!String(r[2] ?? "").trim()) { errors.push(`Row ${i + 1}: provider is required`); continue; }
      const res = await fetch("/api/pharmacy/insurance/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId,
          providerName: String(r[2]).trim(),
          policyNumber: String(r[3] ?? "").trim() || undefined,
          mode: "manual",
        }),
      });
      const body = await res.json();
      if (!res.ok) errors.push(`Row ${i + 1}: ${body.error ?? "claim failed"}`);
      else created++;
    }
    return { created, failed: errors.length, errors };
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex-1" />
        <ImportExportMenu
          entityLabel="Insurance Claims"
          exportCsv={exportCsv}
          exportPdf={exportPdf}
          importColumns={["invoice_number", "provider", "policy_number"]}
          importSample={[["PH-INV-0001", "NHIS", "NH-88231"]]}
          templateFilename="pharmacy-claims-import-template.csv"
          onImport={importClaims}
          onImported={() => void load()}
          allowImport={!viewOnly}
        />
        {!viewOnly && (
        <button type="button" onClick={async () => {
          const res = await fetch("/api/pharmacy/invoices?status=unpaid&pageSize=100", { cache: "no-store" });
          if (res.ok) { setInvoices((await res.json()).data ?? []); setOpen(true); }
        }} className={btnPrimary}>
          <Plus size={14} aria-hidden="true" /> New claim
        </button>
        )}
      </div>

      {error && <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-muted)] text-xs uppercase tracking-wide text-[var(--color-muted-fg)]">
              <th scope="col" className="px-4 py-2.5 font-semibold">Claim</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Invoice</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Provider</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Claim amount</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Co-pay</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Status</th>
              <th scope="col" className="px-4 py-2.5 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-xs text-[var(--color-muted-fg)]">Loadingâ€¦</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-xs text-[var(--color-muted-fg)]">No claims yet.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5 font-medium">{r.claim_number}</td>
                  <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{r.pharmacy_invoices?.invoice_number ?? "â€”"}</td>
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{r.provider_name}</p>
                    {r.policy_number && <p className="text-xs text-[var(--color-muted-fg)]">{r.policy_number}</p>}
                  </td>
                  <td className="px-4 py-2.5 font-semibold">{ngn(r.claim_amount)}</td>
                  <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{ngn(r.co_pay_amount)}</td>
                  <td className="px-4 py-2.5"><Badge value={r.status} /></td>
                  <td className="px-4 py-2.5 text-right">
                    {!viewOnly && (r.status === "pending" || r.status === "draft") && (
                      <div className="flex justify-end gap-1">
                        <button type="button" onClick={() => void process(r.id, "approved", r.claim_amount)} className={btnGhost}>
                          <CheckCircle2 size={13} aria-hidden="true" /> Approve
                        </button>
                        <button type="button" onClick={() => void process(r.id, "rejected")} className={btnGhost + " text-red-600"}>
                          Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <NewClaimModal
          invoices={invoices}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); void load(); }}
        />
      )}
    </div>
  );
}

function NewClaimModal({ invoices, onClose, onSaved }: { invoices: Array<{ id: string; invoice_number: string; total_amount: number }>; onClose: () => void; onSaved: () => void }) {
  const [invoiceId, setInvoiceId] = useState("");
  const [provider, setProvider] = useState("NHIS");
  const [policy, setPolicy] = useState("");
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (!invoiceId) throw new Error("Pick an invoice");
      const res = await fetch("/api/pharmacy/insurance/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId, providerName: provider.trim(), policyNumber: policy.trim() || undefined, mode }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Claim failed");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Claim failed");
    } finally {
      setBusy(false);
    }
  }

  const lbl = "mb-1 block text-xs font-medium text-[var(--color-foreground)]";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="my-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">New insurance claim</h3>
          <button type="button" onClick={onClose} className="focus-ring rounded-lg p-2 text-[var(--color-muted-fg)] hover:bg-slate-100" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className={lbl} htmlFor="cl-inv">Invoice</label>
            <select id="cl-inv" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} className={inputCls}>
              <option value="">Select an unpaid invoiceâ€¦</option>
              {invoices.map((i) => (
                <option key={i.id} value={i.id}>{i.invoice_number} â€” {ngn(i.total_amount)}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl} htmlFor="cl-prov">Provider</label>
              <input id="cl-prov" value={provider} onChange={(e) => setProvider(e.target.value)} className={inputCls} placeholder="NHIS / HMO name" />
            </div>
            <div>
              <label className={lbl} htmlFor="cl-pol">Policy no.</label>
              <input id="cl-pol" value={policy} onChange={(e) => setPolicy(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={lbl}>Mode</label>
            <div className="flex gap-2" role="group" aria-label="Claim mode">
              <button type="button" onClick={() => setMode("auto")} className={mode === "auto" ? btnPrimary : btnGhost}>
                Auto (compute from formulary)
              </button>
              <button type="button" onClick={() => setMode("manual")} className={mode === "manual" ? btnPrimary : btnGhost}>
                Manual (draft)
              </button>
            </div>
          </div>
        </div>

        {error && <p role="alert" className="mt-3 rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">{error}</p>}

        <div className="mt-5 flex gap-3">
          <button type="button" onClick={onClose} className={btnGhost + " flex-1 justify-center py-2.5"}>Cancel</button>
          <button type="button" onClick={submit} disabled={busy} className={btnPrimary + " flex-1 justify-center py-2.5"}>
            {busy ? "Submittingâ€¦" : "Create claim"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FORMULARY (COVERAGE) TAB
// ---------------------------------------------------------------------------
interface CoverageRow {
  id: string;
  provider_name: string;
  is_covered: boolean;
  co_pay_type: string;
  co_pay_value: number;
  max_qty_per_claim: number | null;
  pharmacy_drugs: { name: string } | null;
}

function CoverageTab({ viewOnly = false }: { viewOnly?: boolean }) {
  const [rows, setRows] = useState<CoverageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState("");
  const [drugId, setDrugId] = useState("");
  const [drugName, setDrugName] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DrugOption[]>([]);
  const [isCovered, setIsCovered] = useState(true);
  const [coPayType, setCoPayType] = useState<"percent" | "fixed" | "none">("percent");
  const [coPayValue, setCoPayValue] = useState("25");
  const [maxQty, setMaxQty] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/pharmacy/insurance/coverage", { cache: "no-store" });
      if (res.ok) setRows((await res.json()).data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/pharmacy/drugs?query=${encodeURIComponent(query)}`, { cache: "no-store" });
      if (res.ok) setResults((await res.json()).data ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (!provider.trim() || !drugId) throw new Error("Provider and drug are required");
      const res = await fetch("/api/pharmacy/insurance/coverage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerName: provider.trim(),
          drugId,
          isCovered,
          coPayType,
          coPayValue: ["percent", "fixed"].includes(coPayType) ? Number(coPayValue) || 0 : undefined,
          maxQtyPerClaim: maxQty ? Number(maxQty) : undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Save failed");
      setDrugId("");
      setDrugName("");
      setQuery("");
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const lbl = "mb-1 block text-xs font-medium text-[var(--color-foreground)]";

  const COVERAGE_COLUMNS = ["provider_name", "drug_name", "is_covered", "co_pay_type", "co_pay_value", "max_qty_per_claim"];

  const coverageRows = () =>
    rows.map((r) => [
      r.provider_name,
      r.pharmacy_drugs?.name ?? "",
      r.is_covered ? "yes" : "no",
      r.co_pay_type,
      r.co_pay_value,
      r.max_qty_per_claim ?? "",
    ]);

  function exportCsv() {
    if (rows.length === 0) { alert("Nothing to export â€” there are no formulary rules yet."); return; }
    downloadCsv(`pharmacy-formulary-${dateStamp()}.csv`, COVERAGE_COLUMNS, coverageRows());
  }

  function exportPdf() {
    if (rows.length === 0) { alert("Nothing to export â€” there are no formulary rules yet."); return; }
    printTable("Pharmacy Formulary Coverage", COVERAGE_COLUMNS, coverageRows());
  }

  async function importCoverage(rowsIn: string[][]): Promise<ImportResult> {
    const drugs = await fetchAll<{ id: string; name: string }>("/api/pharmacy/drugs");
    const drugMap = new Map<string, string>(drugs.map((d) => [String(d.name).trim().toLowerCase(), d.id]));
    const errors: string[] = [];
    let created = 0;
    for (let i = 0; i < rowsIn.length; i++) {
      const r = rowsIn[i]!;
      const provider = String(r[0] ?? "").trim();
      const drugName = String(r[1] ?? "").trim();
      if (!provider) { errors.push(`Row ${i + 1}: provider is required`); continue; }
      const drugId = drugMap.get(drugName.toLowerCase());
      if (!drugId) { errors.push(`Row ${i + 1}: unknown drug "${drugName}"`); continue; }
      const coPayType = (["percent", "fixed", "none"].includes(String(r[3] ?? "").toLowerCase()) ? String(r[3]).toLowerCase() : "percent") as "percent" | "fixed" | "none";
      const res = await fetch("/api/pharmacy/insurance/coverage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerName: provider,
          drugId,
          isCovered: !["no", "false", "0"].includes(String(r[2] ?? "").trim().toLowerCase()),
          coPayType,
          coPayValue: ["percent", "fixed"].includes(coPayType) ? Number(r[4]) || 0 : undefined,
          maxQtyPerClaim: String(r[5] ?? "").trim() ? Number(r[5]) : undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) errors.push(`Row ${i + 1}: ${body.error ?? "save failed"}`);
      else created++;
    }
    return { created, failed: errors.length, errors };
  }

  return (
    <div className={`grid gap-5 ${viewOnly ? "lg:grid-cols-1" : "lg:grid-cols-2"}`}>
      {!viewOnly && (
      <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
        <h3 className="text-sm font-bold text-[var(--color-foreground)]">Add formulary rule</h3>
        <p className="mt-0.5 text-xs text-[var(--color-muted-fg)]">
          Defines whether a drug is covered by a provider and the patient co-pay.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className={lbl} htmlFor="cv-prov">Provider</label>
            <input id="cv-prov" value={provider} onChange={(e) => setProvider(e.target.value)} className={inputCls} placeholder="NHIS / HMO name" list="cv-providers" />
            <datalist id="cv-providers">
              {Array.from(new Set(rows.map((r) => r.provider_name))).map((p) => <option key={p} value={p} />)}
            </datalist>
          </div>
          <div>
            <label className={lbl} htmlFor="cv-drug">Drug</label>
            <div className="relative">
              <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-3 top-3 text-[var(--color-muted-fg)]" />
              <input
                id="cv-drug"
                value={drugName || query}
                onChange={(e) => { setQuery(e.target.value); setDrugId(""); setDrugName(""); }}
                placeholder="Search the catalogueâ€¦"
                className={`${inputCls} pl-9`}
              />
            </div>
            {results.length > 0 && (
              <ul className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-white shadow-lg">
                {results.map((d) => (
                  <li key={d.id}>
                    <button type="button" onClick={() => { setDrugId(d.id); setDrugName(d.name); setQuery(""); setResults([]); }} className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-primary-soft)]">
                      <span className="block font-medium">{d.name}</span>
                      <span className="block text-xs text-[var(--color-muted-fg)]">{ngn(d.unitPrice)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isCovered} onChange={(e) => setIsCovered(e.target.checked)} className="accent-[var(--color-primary)]" />
            Covered by this provider
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl} htmlFor="cv-copay">Co-pay type</label>
              <select id="cv-copay" value={coPayType} onChange={(e) => setCoPayType(e.target.value as "percent" | "fixed" | "none")} className={inputCls}>
                <option value="percent">Percent %</option>
                <option value="fixed">Fixed â‚¦</option>
                <option value="none">None</option>
              </select>
            </div>
            <div>
              <label className={lbl} htmlFor="cv-copayv">{coPayType === "percent" ? "Percent %" : coPayType === "fixed" ? "Amount (â‚¦)" : "â€”"}</label>
              <input id="cv-copayv" type="number" min={0} disabled={coPayType === "none"} value={coPayValue} onChange={(e) => setCoPayValue(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={lbl} htmlFor="cv-max">Max qty per claim</label>
            <input id="cv-max" type="number" min={0} value={maxQty} onChange={(e) => setMaxQty(e.target.value)} className={inputCls} placeholder="Unlimited" />
          </div>
        </div>

        {error && <p role="alert" className="mt-3 rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">{error}</p>}

        <button type="button" onClick={save} disabled={busy || !drugId} className={btnPrimary + " mt-4"}>
          {busy ? "Savingâ€¦" : "Save rule"}
        </button>
      </div>
      )}

      <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-[var(--color-foreground)]">Rules</h3>
          <ImportExportMenu
            entityLabel="Formulary Rules"
            exportCsv={exportCsv}
            exportPdf={exportPdf}
            importColumns={COVERAGE_COLUMNS}
            importSample={[["NHIS", "Paracetamol 500mg", "yes", "percent", "25", "30"]]}
            templateFilename="pharmacy-formulary-import-template.csv"
            onImport={importCoverage}
            onImported={() => void load()}
            allowImport={!viewOnly}
          />
        </div>
        {loading ? (
          <p className="py-6 text-center text-xs text-[var(--color-muted-fg)]">Loadingâ€¦</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-xs text-[var(--color-muted-fg)]">No formulary rules yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.pharmacy_drugs?.name ?? "â€”"}</p>
                  <p className="text-xs text-[var(--color-muted-fg)]">
                    {r.provider_name} Â· {r.is_covered ? (
                      <span className="text-emerald-600">
                        {r.co_pay_type === "percent" ? `${r.co_pay_value}% co-pay` : r.co_pay_type === "fixed" ? `${ngn(r.co_pay_value)} co-pay` : "no co-pay"}
                      </span>
                    ) : <span className="text-red-500">not covered</span>}
                    {r.max_qty_per_claim ? ` Â· max ${r.max_qty_per_claim}/claim` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <ShieldCheck size={14} aria-hidden="true" className={r.is_covered ? "text-emerald-500" : "text-red-400"} />
                  {!viewOnly && (
                  <button
                    type="button"
                    className="focus-ring rounded-lg p-1.5 text-[var(--color-muted-fg)] hover:bg-red-50 hover:text-red-600"
                    aria-label="Delete rule"
                    onClick={async () => {
                      await fetch(`/api/pharmacy/insurance/coverage?id=${r.id}`, { method: "DELETE" });
                      void load();
                    }}
                  >
                    <X size={14} />
                  </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DAILY REPORT TAB
// ---------------------------------------------------------------------------
interface DailyReport {
  date: string;
  total_sales: number;
  cash: number;
  pos: number;
  transfer: number;
  card: number;
  insurance: number;
  invoice_count: number;
  item_count: number;
  outstanding: number;
  top_drugs: Array<{ name: string; qty: number }>;
}

function ReportTab({ viewOnly = false }: { viewOnly?: boolean }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/pharmacy/reports/daily?date=${date}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load report");
      setReport(body.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { void load(); }, [load]);

  const methods = useMemo(() => {
    if (!report) return [];
    return [
      ["Cash", report.cash],
      ["POS", report.pos],
      ["Transfer", report.transfer],
      ["Card", report.card],
      ["Insurance", report.insurance],
    ].filter(([, v]) => Number(v) > 0);
  }, [report]);

  const maxMethod = useMemo(() => Math.max(1, ...methods.map(([, v]) => Number(v))), [methods]);

  const REPORT_COLUMNS = ["date", "metric", "value"];

  const reportRows = () => {
    if (!report) return [];
    const out: (string | number)[][] = [
      [date, "total_sales", report.total_sales],
      [date, "invoice_count", report.invoice_count],
      [date, "item_count", report.item_count],
      [date, "outstanding", report.outstanding],
    ];
    for (const [label, value] of methods) out.push([date, String(label).toLowerCase(), Number(value)]);
    for (const d of report.top_drugs) out.push([date, `top_drug:${d.name}`, d.qty]);
    return out;
  };

  function exportCsv() {
    if (!report) { alert("Nothing to export â€” load the report for a date first."); return; }
    downloadCsv(`pharmacy-daily-report-${date}.csv`, REPORT_COLUMNS, reportRows());
  }

  function exportPdf() {
    if (!report) { alert("Nothing to export â€” load the report for a date first."); return; }
    printTable(`Pharmacy Daily Report â€” ${date}`, REPORT_COLUMNS, reportRows());
  }

  async function importReport(_rowsIn: string[][]): Promise<ImportResult> {
    return {
      created: 0,
      failed: 0,
      errors: ["The daily report is generated by the system from sales records and cannot be imported."],
    };
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-medium text-[var(--color-foreground)]" htmlFor="rp-date">Date</label>
        <input id="rp-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inputCls} w-auto`} />
        {loading && <Clock size={14} aria-hidden="true" className="animate-spin text-[var(--color-muted-fg)]" />}
        <ImportExportMenu
          entityLabel="Daily Report"
          exportCsv={exportCsv}
          exportPdf={exportPdf}
          importColumns={REPORT_COLUMNS}
          templateFilename="pharmacy-daily-report-import-template.csv"
          onImport={importReport}
          allowImport={!viewOnly}
        />
      </div>

      {error && <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">{error}</p>}

      {report && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Total sales" value={ngn(report.total_sales)} tone="ok" />
            <Stat label="Invoices" value={report.invoice_count} />
            <Stat label="Items sold" value={report.item_count} />
            <Stat label="Outstanding" value={ngn(report.outstanding)} tone={report.outstanding > 0 ? "warn" : "ok"} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
              <h3 className="text-sm font-bold text-[var(--color-foreground)]">By payment method</h3>
              {methods.length === 0 ? (
                <p className="py-6 text-center text-xs text-[var(--color-muted-fg)]">No sales on this day.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {methods.map(([label, value]) => (
                    <div key={label as string}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">{label}</span>
                        <span className="font-semibold">{ngn(Number(value))}</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-[var(--color-primary)]"
                          style={{ width: `${(Number(value) / maxMethod) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
              <h3 className="text-sm font-bold text-[var(--color-foreground)]">Top drugs</h3>
              {report.top_drugs.length === 0 ? (
                <p className="py-6 text-center text-xs text-[var(--color-muted-fg)]">No items sold on this day.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {report.top_drugs.map((d, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm">
                      <span className="min-w-0 truncate font-medium">{d.name}</span>
                      <span className="shrink-0 text-xs text-[var(--color-muted-fg)]">{d.qty} unit(s)</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "ok" | "warn" }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white p-3 shadow-[var(--shadow-sm)]">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">{label}</p>
      <p className={`mt-1 text-xl font-bold ${tone === "warn" ? "text-amber-600" : tone === "ok" ? "text-emerald-600" : "text-[var(--color-foreground)]"}`}>{value}</p>
    </div>
  );
}
