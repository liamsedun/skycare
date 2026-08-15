"use client";

import { useEffect, use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, ReceiptText } from "lucide-react";
import TenantLetterhead from "@/components/print/tenant-letterhead";
import { useTenantBranding } from "@/lib/use-tenant-branding";

interface ReceiptItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  vat_amount: number | null;
}

interface ReceiptPayment {
  id: string;
  amount: number;
  payment_method: string | null;
  status: string;
  reference: string | null;
  paid_at: string | null;
}

interface ReceiptInvoice {
  invoice_number: string;
  issue_date: string;
  status: string;
  subtotal: number;
  tax_amount: number | null;
  discount_amount: number | null;
  total_amount: number;
  paid_amount: number;
  invoice_items: ReceiptItem[];
  payments: ReceiptPayment[];
}

function ngn(amount: number): string {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(amount);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

export default function PatientReceipt({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [invoice, setInvoice] = useState<ReceiptInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { branding } = useTenantBranding();

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/invoices/${id}`, { cache: "no-store" });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Receipt not found");
        setInvoice(body.data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Receipt not found");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Receipt</h1>
          <p className="mt-1 text-sm text-[var(--color-muted-fg)]">Payment proof for invoice {invoice?.invoice_number ?? ""}.</p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!invoice}
          className="focus-ring inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3.5 py-2 text-sm font-medium text-[var(--color-foreground)] hover:bg-slate-50 disabled:opacity-50 print:hidden"
        >
          <Printer size={15} /> Print
        </button>
      </div>

      <Link href="/patient/billing" className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-primary)] print:hidden">
        <ArrowLeft size={15} /> Back to Bills
      </Link>

      {loading ? (
        <p className="py-10 text-center text-sm text-[var(--color-muted-fg)]">Loading receipt…</p>
      ) : !invoice ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-white py-16 text-center shadow-[var(--shadow-sm)]">
          <ReceiptText size={40} aria-hidden="true" className="mx-auto text-[var(--color-muted-fg)]" />
          <p className="mt-3 text-sm font-medium text-[var(--color-foreground)]">{error ?? "Receipt not found."}</p>
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
                <p className="mt-0.5 text-xs text-[var(--color-muted-fg)]">Issued: {fmtDate(invoice.issue_date)}</p>
              </div>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold uppercase text-emerald-700">
                {invoice.status.replace(/_/g, " ")}
              </span>
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
              <tbody className="divide-y divide-[var(--color-border)]">
                {invoice.invoice_items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2.5 text-[var(--color-foreground)]">
                      {item.description}
                      {item.vat_amount ? <span className="ml-1 text-xs text-[var(--color-muted-fg)]">(+VAT {ngn(item.vat_amount)})</span> : null}
                    </td>
                    <td className="py-2.5 text-right text-[var(--color-muted-fg)]">{item.quantity}</td>
                    <td className="py-2.5 text-right text-[var(--color-muted-fg)]">{ngn(item.unit_price)}</td>
                    <td className="py-2.5 text-right font-medium text-[var(--color-foreground)]">{ngn(item.total_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 flex justify-end text-right text-sm">
              <div className="space-y-1">
                <p className="text-[var(--color-muted-fg)]">Subtotal: {ngn(Number(invoice.subtotal))}</p>
                {invoice.discount_amount ? <p className="text-[var(--color-muted-fg)]">Discount: −{ngn(Number(invoice.discount_amount))}</p> : null}
                {invoice.tax_amount ? <p className="text-[var(--color-muted-fg)]">Tax: {ngn(Number(invoice.tax_amount))}</p> : null}
                <p className="pt-1 text-base font-bold text-[var(--color-foreground)]">
                  Total: {ngn(Number(invoice.total_amount))}
                </p>
                <p className="text-emerald-600">Paid: {ngn(Number(invoice.paid_amount))}</p>
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
                      <span className="text-[var(--color-muted-fg)]">
                        {p.reference ?? "—"} · {p.payment_method?.replace(/_/g, " ") ?? "—"}
                        {p.paid_at ? ` · ${new Date(p.paid_at).toLocaleString("en-NG")}` : ""}
                      </span>
                      <span className="font-semibold text-[var(--color-foreground)]">{ngn(Number(p.amount))}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            <p className="mt-6 text-center text-xs text-[var(--color-muted-fg)]">
              Thank you for choosing {branding?.name ?? "SkyCare HMS"}. This is a computer-generated receipt.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}