"use client";

import { useEffect, useState } from "react";
import { Plus, Printer, Wallet, X } from "lucide-react";
import { useTenantBranding } from "@/lib/use-tenant-branding";
import { divideBorder, flexBetween, flexGap2, ghostIconBtn, modalBackdrop, mutedFg, mutedXs, rowStart } from "@/lib/ui-constants";
import { Badge, btnGhost, btnPrimary, inputCls, ngn, type InvoiceRow } from "./pharmacy-shared";

// ---------------------------------------------------------------------------
// INVOICE DETAIL + SPLIT PAYMENTS + PRINT RECEIPT
// ---------------------------------------------------------------------------
export function InvoiceDetail({ invoice, onClose, onChanged, viewOnly = false }: { invoice: InvoiceRow; onClose: () => void; onChanged: () => void; viewOnly?: boolean }) {
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
    <div className={modalBackdrop} role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className={flexBetween}>
          <div>
            <h3 className="text-lg font-bold">{invoice.invoice_number}</h3>
            <p className={mutedXs}>
              {invoice.patients ? `${invoice.patients.first_name} ${invoice.patients.last_name} (${invoice.patients.patient_number})` : "Walk-in"} Â· {new Date(invoice.created_at).toLocaleString()}
            </p>
          </div>
          <div className={flexGap2}>
            <Badge value={invoice.status} />
            <button type="button" onClick={print} className={btnGhost}><Printer size={13} aria-hidden="true" /></button>
            <button type="button" onClick={onClose} className={ghostIconBtn} aria-label="Close">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--color-border)]">
          <table className={rowStart}>
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-muted)] text-xs uppercase text-[var(--color-muted-fg)]">
                <th className="px-3 py-2 font-semibold">Item</th>
                <th className="px-3 py-2 font-semibold text-right">Qty</th>
                <th className="px-3 py-2 font-semibold text-right">Unit</th>
                <th className="px-3 py-2 font-semibold text-right">Total</th>
              </tr>
            </thead>
            <tbody className={divideBorder}>
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
                  <span className={flexGap2}>
                    <Wallet size={13} aria-hidden="true" className={mutedFg} />
                    <span className="capitalize">{p.method}</span>
                    {p.reference && <span className={mutedXs}>Â· {p.reference}</span>}
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
