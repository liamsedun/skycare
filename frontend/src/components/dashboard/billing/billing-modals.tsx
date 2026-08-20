import { useEffect, useState } from "react";
import { Printer, X } from "lucide-react";
import { CLINICIAN_ROLES } from "@/lib/auth";
import { btnBase, cardTitle, divideBorder, errorBanner, flexBetween, flexWrapGap2, ghostIconBtn, modalBackdrop, mutedFg, mutedSmPlain, rowStart, tableHeadCell } from "@/lib/ui-constants";
import { inputCls, labelCls, ngn, printHref, SOURCE_META, statusClass, type Invoice, type PatientOption } from "./billing-shared";

export function CreateInvoiceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
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
            <span className={cardTitle}>Items</span>
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
          <span className={mutedFg}>Discount (₦)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={discount}
            onChange={(e) => setDiscount(Number(e.target.value))}
            className={`${inputCls} w-32`}
          />
          <div className="ml-auto text-right">
            <p className={mutedFg}>Subtotal {ngn(subtotal)} · Tax {ngn(tax)}</p>
            <p className="text-lg font-bold text-[var(--color-foreground)]">Total {ngn(total)}</p>
          </div>
        </div>

        <div>
          <label className={labelCls} htmlFor="i-notes">Notes (optional)</label>
          <textarea id="i-notes" name="notes" rows={2} className={inputCls} />
        </div>

        {error && (
          <p role="alert" className={errorBanner}>
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

export function InvoiceDetailModal({ invoice, onClose, onChanged, viewOnly = false }: { invoice: Invoice | null; onClose: () => void; onChanged: () => void; viewOnly?: boolean }) {
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
        <div className={flexWrapGap2}>
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${sourceMeta.cls}`}>
            <SourceIcon size={12} aria-hidden="true" /> {sourceMeta.label}
          </span>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(invoice.status)}`}>
            {invoice.status.replace(/_/g, " ")}
          </span>
          <span className={mutedSmPlain}>
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
          <p role="alert" className={errorBanner}>
            {error}
          </p>
        )}

        <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
          <table className={rowStart}>
            <thead>
              <tr className={tableHeadCell}>
                <th scope="col" className={btnBase}>{isPharmacy ? "Drug" : "Description"}</th>
                <th scope="col" className="px-4 py-2.5 text-right font-semibold">Qty</th>
                <th scope="col" className="px-4 py-2.5 text-right font-semibold">Unit</th>
                {!isPharmacy && <th scope="col" className="px-4 py-2.5 text-right font-semibold">VAT</th>}
                <th scope="col" className="px-4 py-2.5 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody className={divideBorder}>
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

export function ModalShell({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div
      className={modalBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className={`my-4 w-full rounded-2xl bg-white p-6 shadow-2xl ${wide ? "max-w-2xl" : "max-w-md"}`}>
        <div className={flexBetween}>
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} className={ghostIconBtn} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}