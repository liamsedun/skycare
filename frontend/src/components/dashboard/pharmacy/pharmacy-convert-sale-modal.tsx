"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { fgMedium, flexBetween, ghostIconBtn, modalBackdrop } from "@/lib/ui-constants";
import { Badge, btnGhost, btnPrimary, inputCls, ngn } from "./pharmacy-shared";

// ---------------------------------------------------------------------------
// CONVERT PRESCRIPTION TO SALE
// Pharmacy staff pick a pending prescription and decide the channel:
//   in-house patient  -> stock issued, invoice in the patient's name, payment
//                       left outstanding on their account, prescription closed.
//   walk-in customer  -> stock issued, invoice raised, cash/transfer collected
//                       NOW (bank ledger credited), prescription closed.
//   external pharmacy -> no stock, no invoice: prescription closed and the
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

export function ConvertSaleModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
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
    <div className={modalBackdrop} role="dialog" aria-modal="true">
      <div className="my-4 w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className={flexBetween}>
          <h3 className="text-lg font-bold">Convert prescription to sale</h3>
          <button type="button" onClick={onClose} className={ghostIconBtn} aria-label="Close">
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
                            <span className={fgMedium}>
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
