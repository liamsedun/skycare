"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Receipt, Wallet, FileText, ShieldCheck, Printer, Plus, X, Search, CheckCircle2, Clock, Banknote,
} from "lucide-react";

// ============================================================================
// Pharmacy Billing — sales invoices, multi-method payments, insurance claims,
// formulary coverage rules and the daily sales report.
// ============================================================================

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
const btnPrimary =
  "focus-ring inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60";
const btnGhost =
  "focus-ring inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-muted-fg)] transition-colors duration-200 hover:bg-slate-50 disabled:opacity-60";
const ngn = (v: number | null | undefined) => `₦${Number(v ?? 0).toLocaleString()}`;

type Tab = "sales" | "payments" | "claims" | "coverage" | "report";

const TABS: Array<{ id: Tab; label: string; icon: typeof Receipt }> = [
  { id: "sales", label: "Sales", icon: Receipt },
  { id: "payments", label: "Payments", icon: Wallet },
  { id: "claims", label: "Claims", icon: FileText },
  { id: "coverage", label: "Formulary", icon: ShieldCheck },
  { id: "report", label: "Daily report", icon: Banknote },
];

export default function PharmacyBillingView() {
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

      {tab === "sales" && <SalesTab />}
      {tab === "payments" && <PaymentsTab />}
      {tab === "claims" && <ClaimsTab />}
      {tab === "coverage" && <CoverageTab />}
      {tab === "report" && <ReportTab />}
    </div>
  );
}

function statusBadge(status: string): string {
  switch (status) {
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

interface DrugOption { id: string; name: string; unitPrice: number; dosage: string | null; stock: number }
interface PatientOption { id: string; label: string }

function SalesTab() {
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<InvoiceRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ pageSize: "50" });
      if (status) params.set("status", status);
      const res = await fetch(`/api/pharmacy/invoices?${params.toString()}`, { cache: "no-store" });
      if (res.ok) setRows((await res.json()).data ?? []);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  async function fetchDetail(id: string) {
    const res = await fetch(`/api/pharmacy/invoices/${id}`, { cache: "no-store" });
    if (res.ok) setDetail((await res.json()).data);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputCls} w-auto`}>
          <option value="">All statuses</option>
          <option value="unpaid">Unpaid</option>
          <option value="partial">Partial</option>
          <option value="paid">Paid</option>
        </select>
        <button type="button" onClick={() => setOpen(true)} className={btnPrimary}>
          <Plus size={14} aria-hidden="true" /> New sale
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--color-border)]">
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
              <tr><td colSpan={7} className="px-4 py-8 text-center text-xs text-[var(--color-muted-fg)]">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-xs text-[var(--color-muted-fg)]">No pharmacy sales yet.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-[var(--color-foreground)]">{r.invoice_number}</td>
                  <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">
                    {r.patients ? `${r.patients.first_name} ${r.patients.last_name}` : "—"}
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
      {detail && <InvoiceDetail invoice={detail} onClose={() => setDetail(null)} onChanged={() => { void fetchDetail(detail.id); void load(); }} />}
    </div>
  );
}

function NewSaleModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [items, setItems] = useState<Array<{ drugId: string; name: string; qty: string; price: string }>>([]);
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
    setItems((prev) => [...prev, { drugId: d.id, name: d.name, qty: "1", price: String(d.unitPrice ?? "") }]);
    setQuery("");
    setResults([]);
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
          throw new Error(`Insufficient stock — ${shortages.join(" · ")}`);
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
        // the pre-flight) — cancel the invoice so we never keep a sale whose
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
          const detail = failed.map((f) => `${f.name}: ${f.reason}`).join(" · ");
          throw new Error(
            cancelled
              ? `Sale cancelled — dispense failed: ${detail}`
              : `Dispense failed: ${detail} — invoice ${body.data?.invoice_number ?? ""} was KEPT, please review it`
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
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
              <label className={lbl} htmlFor="ns-disc">Discount (₦)</label>
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
              placeholder="Search the catalogue…"
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
                      {[d.dosage, `₦${Number(d.unitPrice ?? 0).toLocaleString()}`].filter(Boolean).join(" · ")}
                      <span className="ml-1 text-emerald-600">{d.stock} in stock</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <div className="mt-4 overflow-hidden rounded-lg border border-[var(--color-border)]">
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
                    <td className="px-3 py-2 text-[var(--color-foreground)]">{it.name}</td>
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
          {disc > 0 && <span className="text-red-500">−{ngn(disc)}</span>}
          <span className="text-xl font-bold">{ngn(total)}</span>
        </div>

        {error && <p role="alert" className="mt-3 rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">{error}</p>}

        <div className="mt-5 flex gap-3">
          <button type="button" onClick={onClose} className={btnGhost + " flex-1 justify-center py-2.5"}>Cancel</button>
          <button type="button" onClick={submit} disabled={busy || items.length === 0} className={btnPrimary + " flex-1 justify-center py-2.5"}>
            {busy ? "Creating…" : "Create invoice"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// INVOICE DETAIL + PAYMENTS
// ---------------------------------------------------------------------------
function InvoiceDetail({ invoice, onClose, onChanged }: { invoice: InvoiceRow; onClose: () => void; onChanged: () => void }) {
  const [payments, setPayments] = useState<Array<{ id: string; method: string; amount: number; reference: string | null; received_at: string }>>([]);
  const [splits, setSplits] = useState<Array<{ method: string; amount: string; reference: string }>>([{ method: "cash", amount: "", reference: "" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    w.document.write(`<html><head><title>${invoice.invoice_number}</title><style>
      body{font-family:ui-monospace,monospace;font-size:12px;padding:16px;max-width:320px;margin:auto}
      h1{font-size:14px;margin:0 0 4px} .muted{color:#666} .row{display:flex;justify-content:space-between;margin:2px 0}
      table{width:100%;border-collapse:collapse;margin-top:8px} td{padding:3px 0;border-bottom:1px dashed #ccc}
      .tot{border-top:2px solid #000;margin-top:6px;padding-top:6px}
    </style></head><body>
      <h1>LIFE BLOSSOM PHARMACY</h1>
      <p class="muted">${invoice.invoice_number}<br>${new Date(invoice.created_at).toLocaleString()}<br>${invoice.patients ? `${invoice.patients.first_name} ${invoice.patients.last_name}` : "Walk-in"}</p>
      <table><tbody>
        ${(invoice.pharmacy_invoice_items ?? []).map((it) => `<tr><td>${it.drug_name}</td><td>${it.quantity} × ${ngn(it.unit_price)}</td><td>${ngn(it.total_price)}</td></tr>`).join("")}
      </tbody></table>
      <div class="tot">
        <div class="row"><span>Subtotal</span><span>${ngn(invoice.subtotal)}</span></div>
        ${Number(invoice.discount_amount) > 0 ? `<div class="row"><span>Discount</span><span>−${ngn(invoice.discount_amount)}</span></div>` : ""}
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold">{invoice.invoice_number}</h3>
            <p className="text-xs text-[var(--color-muted-fg)]">
              {invoice.patients ? `${invoice.patients.first_name} ${invoice.patients.last_name} (${invoice.patients.patient_number})` : "Walk-in"} · {new Date(invoice.created_at).toLocaleString()}
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

        <div className="mt-4 overflow-hidden rounded-lg border border-[var(--color-border)]">
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
            <div className="flex justify-between text-red-500"><span>Discount</span><span>−{ngn(invoice.discount_amount)}</span></div>
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
                    {p.reference && <span className="text-xs text-[var(--color-muted-fg)]">· {p.reference}</span>}
                  </span>
                  <span className="font-semibold text-emerald-600">{ngn(p.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {outstanding > 0.01 && (
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
              {busy ? "Recording…" : `Take payment (${ngn(splits.reduce((s, x) => s + (Number(x.amount) || 0), 0))})`}
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

function PaymentsTab() {
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/pharmacy/payments", { cache: "no-store" });
        if (res.ok) setRows((await res.json()).data ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const total = useMemo(() => rows.reduce((s, r) => s + Number(r.amount), 0), [rows]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Transactions" value={rows.length} />
        <Stat label="Collected" value={ngn(total)} tone="ok" />
        <Stat label="Cash" value={ngn(rows.filter((r) => r.method === "cash").reduce((s, r) => s + Number(r.amount), 0))} />
        <Stat label="POS" value={ngn(rows.filter((r) => r.method === "pos").reduce((s, r) => s + Number(r.amount), 0))} />
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--color-border)]">
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
              <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-[var(--color-muted-fg)]">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-[var(--color-muted-fg)]">No payments recorded yet.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5 font-medium">{r.pharmacy_invoices?.invoice_number ?? "—"}</td>
                  <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">
                    {r.pharmacy_invoices?.patients ? `${r.pharmacy_invoices.patients.first_name} ${r.pharmacy_invoices.patients.last_name}` : "Walk-in"}
                  </td>
                  <td className="px-4 py-2.5"><Badge value={r.method} /></td>
                  <td className="px-4 py-2.5 font-semibold text-emerald-600">{ngn(r.amount)}</td>
                  <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{r.reference ?? "—"}</td>
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

function ClaimsTab() {
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

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button type="button" onClick={async () => {
          const res = await fetch("/api/pharmacy/invoices?status=unpaid&pageSize=100", { cache: "no-store" });
          if (res.ok) { setInvoices((await res.json()).data ?? []); setOpen(true); }
        }} className={btnPrimary}>
          <Plus size={14} aria-hidden="true" /> New claim
        </button>
      </div>

      {error && <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-[var(--color-border)]">
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
              <tr><td colSpan={7} className="px-4 py-8 text-center text-xs text-[var(--color-muted-fg)]">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-xs text-[var(--color-muted-fg)]">No claims yet.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5 font-medium">{r.claim_number}</td>
                  <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{r.pharmacy_invoices?.invoice_number ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{r.provider_name}</p>
                    {r.policy_number && <p className="text-xs text-[var(--color-muted-fg)]">{r.policy_number}</p>}
                  </td>
                  <td className="px-4 py-2.5 font-semibold">{ngn(r.claim_amount)}</td>
                  <td className="px-4 py-2.5 text-[var(--color-muted-fg)]">{ngn(r.co_pay_amount)}</td>
                  <td className="px-4 py-2.5"><Badge value={r.status} /></td>
                  <td className="px-4 py-2.5 text-right">
                    {(r.status === "pending" || r.status === "draft") && (
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
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
              <option value="">Select an unpaid invoice…</option>
              {invoices.map((i) => (
                <option key={i.id} value={i.id}>{i.invoice_number} — {ngn(i.total_amount)}</option>
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
            {busy ? "Submitting…" : "Create claim"}
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

function CoverageTab() {
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

  return (
    <div className="grid gap-5 lg:grid-cols-2">
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
                placeholder="Search the catalogue…"
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
                <option value="fixed">Fixed ₦</option>
                <option value="none">None</option>
              </select>
            </div>
            <div>
              <label className={lbl} htmlFor="cv-copayv">{coPayType === "percent" ? "Percent %" : coPayType === "fixed" ? "Amount (₦)" : "—"}</label>
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
          {busy ? "Saving…" : "Save rule"}
        </button>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
        <h3 className="text-sm font-bold text-[var(--color-foreground)]">Rules</h3>
        {loading ? (
          <p className="py-6 text-center text-xs text-[var(--color-muted-fg)]">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-xs text-[var(--color-muted-fg)]">No formulary rules yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.pharmacy_drugs?.name ?? "—"}</p>
                  <p className="text-xs text-[var(--color-muted-fg)]">
                    {r.provider_name} · {r.is_covered ? (
                      <span className="text-emerald-600">
                        {r.co_pay_type === "percent" ? `${r.co_pay_value}% co-pay` : r.co_pay_type === "fixed" ? `${ngn(r.co_pay_value)} co-pay` : "no co-pay"}
                      </span>
                    ) : <span className="text-red-500">not covered</span>}
                    {r.max_qty_per_claim ? ` · max ${r.max_qty_per_claim}/claim` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <ShieldCheck size={14} aria-hidden="true" className={r.is_covered ? "text-emerald-500" : "text-red-400"} />
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

function ReportTab() {
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-[var(--color-foreground)]" htmlFor="rp-date">Date</label>
        <input id="rp-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inputCls} w-auto`} />
        {loading && <Clock size={14} aria-hidden="true" className="animate-spin text-[var(--color-muted-fg)]" />}
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