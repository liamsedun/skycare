"use client";

import { useEffect, use, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Printer, ReceiptText } from "lucide-react";
import TenantLetterhead from "@/components/print/tenant-letterhead";
import { useTenantBranding } from "@/lib/use-tenant-branding";
import { mutedXs, mutedFg, mutedSm, divideBorder, mutedXsMt, fgSemibold, sectionTitle, pageTitle, emptyState } from "@/lib/ui-constants";

interface PrintItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface PrintPayment {
  id: string;
  amount: number;
  payment_method: string | null;
  status: string;
  reference: string | null;
  paid_at: string | null;
}

interface PrintInvoice {
  kind: "central" | "pharmacy";
  invoice_number: string;
  issue_date: string;
  status: string;
  subtotal: number;
  tax_amount: number | null;
  discount_amount: number | null;
  total_amount: number;
  paid_amount: number;
  patient_name: string;
  patient_number: string | null;
  items: PrintItem[];
  payments: PrintPayment[];
}

function ngn(amount: number): string {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(amount);
}

function fmtDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

export default function InvoicePrintView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const kind: "central" | "pharmacy" = searchParams.get("kind") === "pharmacy" ? "pharmacy" : "central";
  const [invoice, setInvoice] = useState<PrintInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { branding } = useTenantBranding();

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(kind === "pharmacy" ? `/api/pharmacy/invoices/${id}` : `/api/invoices/${id}`, { cache: "no-store" });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Invoice not found");
        const d = body.data;
        const items =
          kind === "pharmacy"
            ? (d.pharmacy_invoice_items ?? []).map((it: { id: string; drug_name?: string; description?: string; quantity: number; unit_price: number; total_price: number }) => ({
                id: it.id,
                description: it.description || it.drug_name || "Item",
                quantity: it.quantity,
                unit_price: it.unit_price,
                total_price: it.total_price,
              }))
            : (d.invoice_items ?? []);
        const payments =
          kind === "pharmacy"
            ? (d.pharmacy_payments ?? []).map((p: { id: string; amount: number; method: string; status: string; reference: string | null; received_at: string | null }) => ({
                id: p.id,
                amount: p.amount,
                payment_method: p.method,
                status: p.status,
                reference: p.reference,
                paid_at: p.received_at,
              }))
            : (d.payments ?? []);
        setInvoice({
          kind,
          invoice_number: d.invoice_number,
          issue_date: kind === "pharmacy" ? (d.created_at ?? "").slice(0, 10) : d.issue_date,
          status: kind === "pharmacy" ? (d.status === "unpaid" ? "pending" : d.status === "partial" ? "partially_paid" : d.status) : d.status,
          subtotal: Number(d.subtotal),
          tax_amount: Number(d.tax_amount ?? 0),
          discount_amount: Number(d.discount_amount ?? 0),
          total_amount: Number(d.total_amount),
          paid_amount: Number(d.paid_amount),
          patient_name: d.patients ? `${d.patients.first_name} ${d.patients.last_name}` : "Walk-in customer",
          patient_number: d.patients?.patient_number ?? null,
          items,
          payments,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Invoice not found");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, kind]);

  const statusClass =
    invoice?.status === "paid"
      ? "bg-emerald-100 text-emerald-700"
      : invoice?.status === "pending"
        ? "bg-amber-100 text-amber-700"
        : invoice?.status === "partially_paid"
          ? "bg-sky-100 text-sky-700"
          : invoice?.status === "cancelled"
            ? "bg-red-100 text-red-700"
            : "bg-slate-100 text-slate-600";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className={pageTitle}>Invoice</h1>
          <p className={mutedSm}>
            {kind === "pharmacy" ? "Pharmacy sale bill" : "Bill"} · print it or save as PDF from the print dialog.
          </p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!invoice}
            className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
          >
            <Printer size={15} /> Print / Save as PDF
          </button>
        </div>
      </div>

      <Link href="/app/billing" className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-primary)] print:hidden">
        <ArrowLeft size={15} /> Back to Billing
      </Link>

      {loading ? (
        <p className={emptyState}>Loading invoice…</p>
      ) : !invoice ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-white py-16 text-center shadow-[var(--shadow-sm)]">
          <ReceiptText size={40} aria-hidden="true" className="mx-auto text-[var(--color-muted-fg)]" />
          <p className={sectionTitle}>{error ?? "Invoice not found."}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
          <TenantLetterhead brand={branding} />
          <div className="border-b border-[var(--color-border)] bg-slate-50/60 px-6 py-5">
            <p className="text-center text-[11px] font-bold uppercase tracking-[0.25em] text-[var(--color-muted-fg)]">
              Invoice / Receipt
            </p>
            <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-muted-fg)]">{branding?.name ?? "SkyCare HMS"}</p>
                <p className="font-mono text-lg font-bold text-[var(--color-foreground)]">{invoice.invoice_number}</p>
                <p className={mutedXsMt}>Issued: {fmtDate(invoice.issue_date)}</p>
              </div>
              <div className="text-right">
                <span className={`inline-block rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${statusClass}`}>
                  {invoice.status.replace(/_/g, " ")}
                </span>
                <p className="mt-1.5 text-sm font-medium text-[var(--color-foreground)]">{invoice.patient_name}</p>
                {invoice.patient_number && <p className={mutedXs}>Patient № {invoice.patient_number}</p>}
              </div>
            </div>
          </div>

          <div className="px-6 py-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-muted-fg)]">
                  <th className="pb-2 font-medium">Item</th>
                  <th className="pb-2 text-right font-medium">Qty</th>
                  <th className="pb-2 text-right font-medium">Unit</th>
                  <th className="pb-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className={divideBorder}>
                {invoice.items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2.5 text-[var(--color-foreground)]">{item.description}</td>
                    <td className="py-2.5 text-right text-[var(--color-muted-fg)]">{item.quantity}</td>
                    <td className="py-2.5 text-right text-[var(--color-muted-fg)]">{ngn(Number(item.unit_price))}</td>
                    <td className="py-2.5 text-right font-medium text-[var(--color-foreground)]">{ngn(Number(item.total_price))}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 flex justify-end text-right text-sm">
              <div className="space-y-1">
                <p className={mutedFg}>Subtotal: {ngn(Number(invoice.subtotal))}</p>
                {invoice.discount_amount ? <p className={mutedFg}>Discount: −{ngn(Number(invoice.discount_amount))}</p> : null}
                {invoice.tax_amount ? <p className={mutedFg}>Tax: {ngn(Number(invoice.tax_amount))}</p> : null}
                <p className="pt-1 text-base font-bold text-[var(--color-foreground)]">Total: {ngn(Number(invoice.total_amount))}</p>
                <p className="text-emerald-600">Paid: {ngn(Number(invoice.paid_amount))}</p>
                <p className="text-amber-600">Balance: {ngn(Number(invoice.total_amount) - Number(invoice.paid_amount))}</p>
              </div>
            </div>

            {invoice.payments.length > 0 && (
              <>
                <div className="mt-5 border-t border-[var(--color-border)] pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">Payments</p>
                </div>
                <div className="mt-2 space-y-1.5">
                  {invoice.payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5 text-sm">
                      <span className={mutedFg}>
                        {p.reference ?? "—"} · {p.payment_method?.replace(/_/g, " ") ?? "—"}
                        {p.paid_at ? ` · ${new Date(p.paid_at).toLocaleString("en-NG")}` : ""}
                      </span>
                      <span className={fgSemibold}>{ngn(Number(p.amount))}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            <p className="mt-6 text-center text-xs text-[var(--color-muted-fg)]">
              Thank you for choosing {branding?.name ?? "SkyCare HMS"}. This is a computer-generated bill.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}