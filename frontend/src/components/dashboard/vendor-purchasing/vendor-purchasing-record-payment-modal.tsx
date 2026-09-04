"use client";

import { useEffect, useState } from "react";
import { ngn } from "@/lib/auth";
import { useCurrency, currencySymbol } from "@/lib/currency";
import { errorBanner, mutedXsMt1 } from "@/lib/ui-constants";
import { inputCls, labelCls, METHOD_LABELS, METHOD_ICONS, SupplierOption, ModalShell } from "./vendor-purchasing-shared";

export function RecordPaymentModal({
  suppliers,
  outstandingFor,
  onClose,
  onRecorded,
}: {
  suppliers: SupplierOption[];
  outstandingFor: (supplierId: string) => number | null;
  onClose: () => void;
  onRecorded: () => Promise<void>;
}) {
  const [supplierId, setSupplierId] = useState("");
  const [poId, setPoId] = useState("");
  const [pos, setPos] = useState<Array<{ id: string; poNumber: string; status: string; totalCost: number }>>([]);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("bank_transfer");
  const [bankAccountId, setBankAccountId] = useState("");
  const [bankAccounts, setBankAccounts] = useState<Array<{ account_id: string | null; label: string; bank_name: string | null }>>([]);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { currency } = useCurrency();

  async function pickSupplier(sid: string) {
    setSupplierId(sid);
    setPoId("");
    try {
      const res = await fetch(`/api/pharmacy/procurement/purchase-orders?pageSize=100&supplier_id=${sid}`, { cache: "no-store" });
      const body = await res.json();
      const all = ((body.data ?? []) as Array<{ id: string; poNumber: string; status: string; totalCost: number }>);
      setPos(all.filter((p) => p.status === "sent" || p.status === "approved" || p.status === "received"));
    } catch {
      setPos([]);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/banking", { cache: "no-store" });
        const body = await res.json();
        if (res.ok) {
          setBankAccounts(((body.accounts ?? []) as Array<{ account_id: string | null; label: string; bank_name: string | null }>)
            .filter((a) => a.bank_name));
        }
      } catch { /* non-critical */ }
    })();
  }, []);

  const outstanding = supplierId ? outstandingFor(supplierId) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        supplierId,
        poId: poId || undefined,
        amount: Number(amount),
        method,
        bankAccountId: bankAccountId || undefined,
        reference: reference || undefined,
        notes: notes || undefined,
        paidAt: paidAt || undefined,
      };
      const res = await fetch("/api/pharmacy/procurement/supplier-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const resBody = await res.json();
      if (!res.ok) throw new Error(resBody.error ?? "Failed to record payment");
      await onRecorded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to record payment");
    } finally {
      setBusy(false);
    }
  }

  const showBankPicker = method === "bank_transfer" || method === "pos";

  return (
    <ModalShell title="Record supplier payment" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={labelCls} htmlFor="pay-supplier">Supplier</label>
          <select id="pay-supplier" required value={supplierId} onChange={(e) => pickSupplier(e.target.value)} className={inputCls}>
            <option value="">Select supplier…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {outstanding !== null && (
            <p className={`mt-1 text-xs font-medium ${outstanding > 0 ? "text-rose-600" : "text-emerald-600"}`}>
              {outstanding > 0 ? `Owing: ${ngn(outstanding)}` : outstanding < 0 ? `In credit: ${ngn(-outstanding)}` : "Balance settled"}
            </p>
          )}
        </div>

        <div>
          <label className={labelCls} htmlFor="pay-po">Against order (optional)</label>
          <select id="pay-po" value={poId} onChange={(e) => setPoId(e.target.value)} className={inputCls} disabled={!supplierId}>
            <option value="">Supplier balance (no specific order)</option>
            {pos.map((p) => (
              <option key={p.id} value={p.id}>{p.poNumber} — {p.status} · {ngn(p.totalCost)}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="pay-amount">Amount ({currencySymbol(currency)})</label>
            <input id="pay-amount" type="number" min={0.01} step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="pay-date">Payment date</label>
            <input id="pay-date" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className={inputCls} />
          </div>
        </div>

        <div>
          <span className={labelCls}>Method</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(["bank_transfer", "cash", "pos", "credit_note"] as const).map((m) => {
              const Icon = METHOD_ICONS[m];
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  aria-pressed={method === m}
                  className={`focus-ring flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs font-medium transition-colors duration-200 ${
                    method === m
                      ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]"
                      : "border-[var(--color-border)] text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)]/50"
                  }`}
                >
                  <Icon size={16} aria-hidden="true" />
                  {METHOD_LABELS[m]}
                </button>
              );
            })}
          </div>
          {method === "credit_note" && (
            <p className={mutedXsMt1}>
              A credit note reduces what you owe the supplier — no money leaves the hospital.
            </p>
          )}
        </div>

        {showBankPicker && (
          <div>
            <label className={labelCls} htmlFor="pay-bank">Bank account</label>
            <select id="pay-bank" value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} className={inputCls}>
              <option value="">Default bank account</option>
              {bankAccounts.map((a) => (
                <option key={a.account_id} value={a.account_id ?? ""}>{a.label}</option>
              ))}
            </select>
            <p className={mutedXsMt1}>
              The payment posts to the Banking ledger as money leaving the hospital.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="pay-ref">Reference (optional)</label>
            <input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} className={inputCls} placeholder="Teller / transfer ref…" />
          </div>
          <div>
            <label className={labelCls} htmlFor="pay-notes">Notes</label>
            <input id="pay-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} placeholder="Optional note" />
          </div>
        </div>

        {error && (
          <p role="alert" className={errorBanner}>{error}</p>
        )}

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2.5 text-sm font-medium hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={busy || !supplierId} className="focus-ring flex-1 rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-60">
            {busy ? "Recording…" : "Record payment"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

