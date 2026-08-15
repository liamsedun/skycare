"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronDown, Landmark, ReceiptText } from "lucide-react";
import { inDateRange } from "@/lib/daterange";
import DateRangeBar from "@/components/filters/date-range-bar";

interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  vat_percent: number | null;
  vat_amount: number | null;
}

interface Payment {
  id: string;
  amount: number;
  payment_method: string | null;
  status: string;
  reference: string | null;
  paid_at: string | null;
}

interface Invoice {
  id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string | null;
  status: string;
  subtotal: number;
  tax_amount: number | null;
  discount_amount: number | null;
  total_amount: number;
  paid_amount: number;
  notes: string | null;
  patients: { first_name: string; last_name: string } | null;
  invoice_items: InvoiceItem[];
  payments: Payment[];
}

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";

function ngn(amount: number): string {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(amount);
}

function statusClass(status: string): string {
  switch (status) {
    case "paid": return "bg-emerald-100 text-emerald-700";
    case "pending": return "bg-amber-100 text-amber-700";
    case "partially_paid": return "bg-sky-100 text-sky-700";
    default: return "bg-slate-100 text-slate-500";
  }
}

export default function PatientBilling() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [declareInvoice, setDeclareInvoice] = useState<Invoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [onlineEnabled, setOnlineEnabled] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const searchParams = useSearchParams();
  const paystackStatus = searchParams.get("paystack");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/invoices?pageSize=100", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load invoices");
      setInvoices(body.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/payments/gateway-status", { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => {
        if (b.data?.enabled) setOnlineEnabled(true);
      })
      .catch(() => {});
  }, []);

  // On return from the Paystack checkout, refresh invoice state and drop the
  // ?paystack= param so the banner doesn't linger on future visits.
  useEffect(() => {
    if (paystackStatus) {
      load();
      const url = new URL(window.location.href);
      url.searchParams.delete("paystack");
      url.searchParams.delete("reference");
      window.history.replaceState({}, "", url.toString());
    }
  }, [paystackStatus, load]);

  const outstanding = invoices
    .filter((inv) => ["pending", "partially_paid"].includes(inv.status))
    .reduce((sum, inv) => sum + (Number(inv.total_amount) - Number(inv.paid_amount)), 0);

  const visible = invoices.filter((inv) => inDateRange(inv.issue_date, from, to));

  async function declarePayment(invoiceId: string, amount: number, method: string) {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      if (method === "online") {
        const res = await fetch("/api/payments/initialize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoiceId, amount }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to start online payment");
        if (!body.data.enabled) {
          throw new Error("Online payments are not configured for this hospital yet.");
        }
        // Redirect to the Paystack checkout. On return, the callback route
        // points us back here with ?paystack=success|failed|processing.
        window.location.href = body.data.authorization_url;
        return;
      }
      const res = await fetch("/api/payments/declare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId, amount, paymentMethod: method }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to declare payment");
      setSuccess("Payment declared — billing will confirm it shortly.");
      setDeclareInvoice(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to declare payment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Bills & payments</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-fg)]">
          Outstanding balance: <span className="font-semibold text-amber-600">{ngn(outstanding)}</span>
        </p>
      </div>

      <DateRangeBar from={from} to={to} onFromChange={setFrom} onToChange={setTo} onClear={() => { setFrom(""); setTo(""); }} />

      {error && (
        <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
          {success}
        </p>
      )}
      {paystackStatus && (
        <p
          role="status"
          className={`rounded-lg px-3 py-2 text-sm font-medium ${
            paystackStatus === "success"
              ? "bg-emerald-50 text-emerald-700"
              : paystackStatus === "processing"
              ? "bg-sky-50 text-sky-700"
              : "bg-amber-50 text-amber-700"
          }`}
        >
          {paystackStatus === "success"
            ? "Payment received — thank you! Refreshing your bills…"
            : paystackStatus === "processing"
              ? "Payment is being confirmed… this may take a few seconds."
              : "Online payment did not complete. You can try again below."}
        </p>
      )}

      {loading ? (
        <p className="py-10 text-center text-sm text-[var(--color-muted-fg)]">Loading invoices…</p>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-white py-16 text-center shadow-[var(--shadow-sm)]">
          <ReceiptText size={40} aria-hidden="true" className="mx-auto text-[var(--color-muted-fg)]" />
          <p className="mt-3 text-sm font-medium text-[var(--color-foreground)]">No invoices yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((inv) => {
            const due = Number(inv.total_amount) - Number(inv.paid_amount);
            const open = expanded === inv.id;
            return (
              <div key={inv.id} className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : inv.id)}
                  className="focus-ring flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3.5 text-left"
                >
                  <div className="flex items-center gap-3">
                    <ChevronDown size={16} aria-hidden="true" className={`text-[var(--color-muted-fg)] transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
                    <div>
                      <p className="font-mono text-sm font-semibold text-[var(--color-foreground)]">{inv.invoice_number}</p>
                      <p className="text-xs text-[var(--color-muted-fg)]">
                        {inv.patients ? `${inv.patients.first_name} ${inv.patients.last_name}` : ""} ·{" "}
                        {new Date(inv.issue_date).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${statusClass(inv.status)}`}>
                      {inv.status.replace(/_/g, " ")}
                    </span>
                    <p className="text-sm font-semibold text-[var(--color-foreground)]">{ngn(Number(inv.total_amount))}</p>
                  </div>
                </button>

                {open && (
                  <div className="border-t border-[var(--color-border)] bg-slate-50/60 px-4 py-4">
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
                        {inv.invoice_items.map((item) => (
                          <tr key={item.id}>
                            <td className="py-2 text-[var(--color-foreground)]">
                              {item.description}
                              {item.vat_amount ? <span className="ml-1 text-xs text-[var(--color-muted-fg)]">(+VAT {ngn(item.vat_amount)})</span> : null}
                            </td>
                            <td className="py-2 text-right text-[var(--color-muted-fg)]">{item.quantity}</td>
                            <td className="py-2 text-right text-[var(--color-muted-fg)]">{ngn(item.unit_price)}</td>
                            <td className="py-2 text-right font-medium text-[var(--color-foreground)]">{ngn(item.total_price)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="mt-3 flex justify-end space-y-1 text-right text-sm">
                      <div>
                        <p className="text-[var(--color-muted-fg)]">
                          Subtotal: {ngn(Number(inv.subtotal))}
                          {inv.discount_amount ? <> · Discount: −{ngn(inv.discount_amount)}</> : null}
                          {inv.tax_amount ? <> · Tax: {ngn(inv.tax_amount)}</> : null}
                        </p>
                        <p className="mt-1 text-base font-bold text-[var(--color-foreground)]">
                          Total: {ngn(Number(inv.total_amount))} · Paid: {ngn(Number(inv.paid_amount))} · Due:{" "}
                          <span className={due > 0 ? "text-amber-600" : "text-emerald-600"}>{ngn(due)}</span>
                        </p>
                      </div>
                    </div>

                    {inv.payments.length > 0 && (
                      <div className="mt-3 border-t border-[var(--color-border)] pt-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">Payments</p>
                        <ul className="mt-2 space-y-1.5">
                          {inv.payments.map((p) => (
                            <li key={p.id} className="flex items-center justify-between text-sm">
                              <span className="text-[var(--color-muted-fg)]">
                                {p.reference ?? "—"} · {p.payment_method?.replace(/_/g, " ") ?? "—"}
                                {p.paid_at ? ` · ${new Date(p.paid_at).toLocaleString("en-NG")}` : ""}
                              </span>
                              <span className="flex items-center gap-2">
                                <span className="font-medium text-[var(--color-foreground)]">{ngn(Number(p.amount))}</span>
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${statusClass(p.status)}`}>
                                  {p.status.replace(/_/g, " ")}
                                </span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {["pending", "partially_paid"].includes(inv.status) && (
                      <div className="mt-4 flex justify-end">
                        <button
                          type="button"
                          onClick={() => setDeclareInvoice(inv)}
                          className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)]"
                        >
                          <Landmark size={15} aria-hidden="true" /> Declare Payment
                        </button>
                      </div>
                    )}
                    <div className="mt-3 flex justify-end border-t border-[var(--color-border)] pt-3">
                      <Link
                        href={`/patient/receipt/${inv.id}`}
                        className="focus-ring inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-primary)] hover:underline"
                      >
                        <ReceiptText size={15} aria-hidden="true" /> View Receipt
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {declareInvoice && (
        <DeclareModal
          invoice={declareInvoice}
          busy={busy}
          onlineEnabled={onlineEnabled}
          onClose={() => setDeclareInvoice(null)}
          onDeclare={declarePayment}
        />
      )}
    </div>
  );
}

function DeclareModal({
  invoice,
  busy,
  onlineEnabled,
  onClose,
  onDeclare,
}: {
  invoice: Invoice;
  busy: boolean;
  onlineEnabled: boolean;
  onClose: () => void;
  onDeclare: (invoiceId: string, amount: number, method: string) => void;
}) {
  const [amount, setAmount] = useState<string>(
    String(Math.round((Number(invoice.total_amount) - Number(invoice.paid_amount)) * 100) / 100)
  );
  const [method, setMethod] = useState(onlineEnabled ? "online" : "bank_transfer");
  const [accounts, setAccounts] = useState<{ id: string; bank_name: string; account_name: string; account_number: string }[]>([]);

  const due = Number(invoice.total_amount) - Number(invoice.paid_amount);
  const parsed = Number(amount);

  useEffect(() => {
    fetch("/api/settings/bank-accounts", { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => {
        if (b.data) setAccounts(b.data);
      })
      .catch(() => {});
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Declare Payment"
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Declare Payment</h2>
          <button type="button" onClick={onClose} className="focus-ring rounded-lg p-2 text-[var(--color-muted-fg)] hover:bg-slate-100" aria-label="Close">
            ✕
          </button>
        </div>
        <p className="mt-1 text-sm text-[var(--color-muted-fg)]">
          {invoice.invoice_number} — outstanding <span className="font-semibold text-amber-600">{ngn(due)}</span>
        </p>
        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (parsed > 0) onDeclare(invoice.id, parsed, method);
          }}
        >
          <div>
            <label className={labelCls} htmlFor="dec-amount">Amount (₦)</label>
            <input
              id="dec-amount"
              type="number"
              min="0.01"
              max={due}
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={inputCls}
            />
            <button
              type="button"
              onClick={() => setAmount(String(due))}
              className="focus-ring mt-1 text-xs font-medium text-[var(--color-primary)] hover:underline"
            >
              Pay full balance ({ngn(due)})
            </button>
          </div>
          <div>
            <label className={labelCls} htmlFor="dec-method">How did you pay?</label>
            <select id="dec-method" value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>
              {onlineEnabled && <option value="online">Pay online (card)</option>}
              <option value="bank_transfer">Bank transfer</option>
              <option value="pos">POS / card at the hospital</option>
            </select>
          </div>
          {method === "bank_transfer" && accounts.length > 0 && (
            <div className="rounded-lg border border-[var(--color-border)] bg-slate-50 p-3">
              <p className="text-xs font-semibold text-[var(--color-foreground)]">Pay into any of these accounts</p>
              <ul className="mt-2 space-y-2">
                {accounts.map((a) => (
                  <li key={a.id} className="text-xs text-[var(--color-muted-fg)]">
                    <span className="font-semibold text-[var(--color-foreground)]">{a.bank_name}</span> — {a.account_name} ·{" "}
                    <span className="font-mono font-semibold text-[var(--color-foreground)]">{a.account_number}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {method !== "online" && (
            <p className="text-xs text-[var(--color-muted-fg)]">
              Your payment will show as <strong>pending</strong> until billing staff confirm it. If the POS payment was
              processed by the hospital directly, you don&apos;t need to declare it.
            </p>
          )}
          {method === "online" && (
            <p className="text-xs text-[var(--color-muted-fg)]">
              You&apos;ll be taken to a secure Paystack checkout to pay by card. The payment is confirmed automatically
              when it completes.
            </p>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2.5 text-sm font-medium transition-colors duration-200 hover:bg-slate-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !(parsed > 0) || parsed > due + 0.01}
              className="focus-ring flex-1 rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
            >
              {busy ? "Submitting…" : method === "online" ? "Continue to Payment" : "Declare Payment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
