"use client";

import { useEffect, use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, ReceiptText } from "lucide-react";
import TenantLetterhead from "@/components/print/tenant-letterhead";
import { useTenantBranding } from "@/lib/use-tenant-branding";
import { mutedFg, flexBetween, mutedSm, divideBorder, mutedXsMt, fgSemibold, sectionTitle, pageTitle, emptyState } from "@/lib/ui-constants";

interface ReceiptData {
  tenant_name: string;
  request: {
    id: string;
    requested_at: string;
    status: string;
    referrer: string | null;
    notes: string | null;
  };
  patient: {
    id: string;
    patient_number: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    email: string | null;
    is_walk_in: boolean | null;
  } | null;
  payment: {
    id: string;
    reference: string | null;
    amount: number;
    payment_method: string | null;
    status: string;
    paid_at: string | null;
    gateway: string | null;
  } | null;
  items: Array<{ service_name: string; price: number }>;
  total: number;
}

function ngn(amount: number): string {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(amount);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

export default function LabPaymentReceipt({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { branding } = useTenantBranding();

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/lab-requests/${id}/receipt`, { cache: "no-store" });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Receipt not found");
        setReceipt(body.data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Receipt not found");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  return (
    <div className="space-y-6">
      <div className={flexBetween}>
        <div>
          <h1 className={pageTitle}>Payment Receipt</h1>
          <p className={mutedSm}>
            Proof of payment for walk-in / external lab services.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!receipt}
          className="focus-ring inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3.5 py-2 text-sm font-medium text-[var(--color-foreground)] hover:bg-slate-50 disabled:opacity-50 print:hidden"
        >
          <Printer size={15} /> Print
        </button>
      </div>

      <Link href="/app/lab/requests" className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-primary)] print:hidden">
        <ArrowLeft size={15} /> Back to Lab Requests
      </Link>

      {loading ? (
        <p className={emptyState}>Loading receipt…</p>
      ) : !receipt ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-white py-16 text-center shadow-[var(--shadow-sm)]">
          <ReceiptText size={40} aria-hidden="true" className="mx-auto text-[var(--color-muted-fg)]" />
          <p className={sectionTitle}>{error ?? "Receipt not found."}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
          <TenantLetterhead brand={branding} />
          <div className="border-b border-[var(--color-border)] bg-slate-50/60 px-6 py-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-muted-fg)]">{branding?.name ?? receipt.tenant_name}</p>
                <p className="font-mono text-lg font-bold text-[var(--color-foreground)]">
                  {receipt.payment?.reference ?? `LAB-${receipt.request.id.slice(0, 8)}`}
                </p>
                <p className={mutedXsMt}>Paid: {fmtDate(receipt.payment?.paid_at ?? null)}</p>
                {receipt.request.referrer && (
                  <p className={mutedXsMt}>Referrer: {receipt.request.referrer}</p>
                )}
              </div>
              <div className="text-right">
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${receipt.payment?.status === "completed" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                  {receipt.payment?.status.replace(/_/g, " ") ?? "pending"}
                </span>
                <p className="mt-1.5 text-xs text-[var(--color-muted-fg)]">
                  {receipt.payment?.payment_method?.replace(/_/g, " ").toUpperCase() ?? ""}
                </p>
              </div>
            </div>
          </div>

          <div className="px-6 py-5">
            {receipt.patient && (
              <div className="mb-4 rounded-lg bg-slate-50 px-4 py-3 text-sm">
                <p className={fgSemibold}>
                  {receipt.patient.first_name} {receipt.patient.last_name}
                  {receipt.patient.is_walk_in ? <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-violet-700">Walk-in</span> : null}
                </p>
                <p className={mutedXsMt}>
                  {receipt.patient.patient_number}
                  {receipt.patient.phone ? ` · ${receipt.patient.phone}` : ""}
                  {receipt.patient.email ? ` · ${receipt.patient.email}` : ""}
                </p>
              </div>
            )}

            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-muted-fg)]">
                  <th className="pb-2 font-medium">Service</th>
                  <th className="pb-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className={divideBorder}>
                {receipt.items.map((item, i) => (
                  <tr key={i}>
                    <td className="py-2.5 text-[var(--color-foreground)]">{item.service_name}</td>
                    <td className="py-2.5 text-right text-[var(--color-muted-fg)]">{ngn(item.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 flex justify-end text-right text-sm">
              <div className="space-y-1">
                <p className={mutedFg}>Total: {ngn(receipt.total)}</p>
                <p className="text-emerald-600">Amount paid: {ngn(Number(receipt.payment?.amount ?? 0))}</p>
                <p className="font-medium text-[var(--color-muted-fg)]">Balance: {ngn(Math.max(0, receipt.total - Number(receipt.payment?.amount ?? 0)))}</p>
              </div>
            </div>

            <p className="mt-6 text-center text-xs text-[var(--color-muted-fg)]">
              Thank you for choosing {receipt.tenant_name}. This is a computer-generated receipt for walk-in lab services — no invoice is issued.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
