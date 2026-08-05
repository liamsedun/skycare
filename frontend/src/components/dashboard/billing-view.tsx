"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, ReceiptText, X } from "lucide-react";

interface PatientOption {
  id: string;
  label: string;
}

interface Invoice {
  id: string;
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

export default function BillingView() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [pending, setPending] = useState<PendingPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ pageSize: "100" });
      if (filter !== "all") params.set("status", filter);
      const [invoiceRes, pendingRes] = await Promise.all([
        fetch(`/api/invoices?${params.toString()}`, { cache: "no-store" }),
        fetch("/api/payments?status=pending&pageSize=100", { cache: "no-store" }),
      ]);
      const invoiceBody = await invoiceRes.json();
      const pendingBody = await pendingRes.json();
      if (!invoiceRes.ok) throw new Error(invoiceBody.error ?? "Failed to load invoices");
      setInvoices(invoiceBody.data ?? []);
      setPending(pendingBody.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => {
    let outstanding = 0;
    let collected = 0;
    for (const inv of invoices) {
      if (["pending", "partially_paid"].includes(inv.status)) {
        outstanding += Number(inv.total_amount) - Number(inv.paid_amount);
      }
      collected += Number(inv.paid_amount);
    }
    return { outstanding, collected };
  }, [invoices]);

  const viewed = viewId ? invoices.find((i) => i.id === viewId) ?? null : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold text-[var(--color-foreground)]">
            Billing
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted-fg)]">
            Invoices, payments and patient declarations.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)]"
        >
          <Plus size={16} aria-hidden="true" /> Create invoice
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
          {error}
        </p>
      )}

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-sm)]">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-fg)]">Outstanding</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{ngn(totals.outstanding)}</p>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-sm)]">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-fg)]">Collected (shown list)</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{ngn(totals.collected)}</p>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-sm)]">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-fg)]">Awaiting confirmation</p>
          <p className="mt-1 text-2xl font-bold text-sky-600">{pending.length}</p>
        </div>
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
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Status filters */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter invoices">
        {STATUS_FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setFilter(item)}
            aria-pressed={filter === item}
            className={`focus-ring rounded-full px-3 py-1.5 text-sm font-medium capitalize transition-colors duration-200 ${
              filter === item
                ? "bg-[var(--color-primary)] text-white"
                : "bg-white text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)]"
            }`}
          >
            {item.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {/* Invoice list */}
      {loading ? (
        <p className="py-10 text-center text-sm text-[var(--color-muted-fg)]">Loading invoices…</p>
      ) : invoices.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-white py-16 text-center shadow-[var(--shadow-sm)]">
          <ReceiptText size={40} aria-hidden="true" className="mx-auto text-[var(--color-muted-fg)]" />
          <p className="mt-3 text-sm font-medium text-[var(--color-foreground)]">
            No invoices found.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {invoices.map((inv) => {
            const outstanding = Number(inv.total_amount) - Number(inv.paid_amount);
            return (
              <div key={inv.id} className="rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-sm)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold text-[var(--color-foreground)]">
                      {inv.invoice_number}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-[var(--color-muted-fg)]">
                      {inv.patients ? `${inv.patients.first_name} ${inv.patients.last_name}` : "Unknown"}
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
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => setViewId(inv.id)}
                    className="focus-ring w-full rounded-lg border border-[var(--color-border)] py-2 text-xs font-semibold text-[var(--color-primary)] transition-colors duration-200 hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]"
                  >
                    View & record payment
                  </button>
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
          invoice={viewed}
          onClose={() => setViewId(null)}
          onChanged={() => {
            load();
            router.refresh();
          }}
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
            .filter((s: { users?: { role?: string } }) => s.users?.role === "doctor")
            .map((s: { id: string; users?: { full_name?: string } }) => ({ id: s.id, label: s.users?.full_name ?? "Doctor" }))
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
    <ModalShell title="Create invoice" onClose={onClose}>
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

        <div className="flex items-center gap-3 rounded-xl bg-[var(--color-muted)]/40 px-4 py-3 text-sm">
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
            {busy ? "Creating…" : "Create invoice"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function InvoiceDetailModal({ invoice, onClose, onChanged }: { invoice: Invoice; onClose: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState<number>(Number(invoice.total_amount) - Number(invoice.paid_amount));
  const [method, setMethod] = useState("cash");

  const outstanding = Number(invoice.total_amount) - Number(invoice.paid_amount);
  const completed = invoice.payments.filter((p) => p.status === "completed");
  const pending = invoice.payments.filter((p) => p.status === "pending");

  async function recordPayment() {
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
          allocation: [{ invoiceId: invoice.id, amount }],
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to record payment");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to record payment");
    } finally {
      setBusy(false);
    }
  }

  async function cancelInvoice() {
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to cancel invoice");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title={`${invoice.invoice_number} — ${invoice.patients ? `${invoice.patients.first_name} ${invoice.patients.last_name}` : ""}`} onClose={onClose} wide>
      <div className="mt-5 space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(invoice.status)}`}>
            {invoice.status.replace(/_/g, " ")}
          </span>
          <span className="text-sm text-[var(--color-muted-fg)]">
            Issued {invoice.issue_date}
            {invoice.due_date ? ` · Due ${invoice.due_date}` : ""}
          </span>
          {invoice.status !== "paid" && invoice.status !== "cancelled" && (
            <button
              type="button"
              onClick={cancelInvoice}
              disabled={busy}
              className="focus-ring ml-auto rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
            >
              Cancel invoice
            </button>
          )}
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
                <th scope="col" className="px-4 py-2.5 font-semibold">Description</th>
                <th scope="col" className="px-4 py-2.5 text-right font-semibold">Qty</th>
                <th scope="col" className="px-4 py-2.5 text-right font-semibold">Unit</th>
                <th scope="col" className="px-4 py-2.5 text-right font-semibold">VAT</th>
                <th scope="col" className="px-4 py-2.5 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {invoice.invoice_items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-2.5 font-medium text-[var(--color-foreground)]">{item.description}</td>
                  <td className="px-4 py-2.5 text-right text-[var(--color-muted-fg)]">{item.quantity}</td>
                  <td className="px-4 py-2.5 text-right text-[var(--color-muted-fg)]">{ngn(Number(item.unit_price))}</td>
                  <td className="px-4 py-2.5 text-right text-[var(--color-muted-fg)]">{Number(item.vat_amount).toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold">{ngn(Number(item.total_price))}</td>
                </tr>
              ))}
              <tr className="bg-[var(--color-muted)]/40 text-sm font-bold">
                <td colSpan={4} className="px-4 py-2.5 text-right text-[var(--color-muted-fg)]">
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
          {outstanding > 0 && invoice.status !== "cancelled" && (
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
          )}
        </section>
      </div>
    </ModalShell>
  );
}

function ModalShell({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl ${wide ? "max-w-2xl" : "max-w-md"}`}>
        <div className="flex items-center justify-between">
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="focus-ring rounded-lg p-2 text-[var(--color-muted-fg)] hover:bg-slate-100" aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
