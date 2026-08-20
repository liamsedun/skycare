"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { divideBorder, flexBetween, ghostIconBtn, modalBackdrop, mutedFg, rowStart } from "@/lib/ui-constants";
import { btnGhost, btnPrimary, inputCls, ngn, type DrugOption, type PatientOption } from "./pharmacy-shared";

// ---------------------------------------------------------------------------
// NEW COUNTER SALE MODAL - basket builder with stock pre-flight and dispense
// ---------------------------------------------------------------------------
export function NewSaleModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [items, setItems] = useState<Array<{ drugId: string; name: string; qty: string; price: string; priceSource?: DrugOption["priceSource"] }>>([]);
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
    setItems((prev) => [...prev, { drugId: d.id, name: d.name, qty: "1", price: String(d.unitPrice ?? ""), priceSource: d.priceSource }]);
    setQuery("");
    setResults([]);
  }

  function priceSourceChip(source?: DrugOption["priceSource"]) {
    if (source === "branch_override") {
      return (
        <span className="ml-2 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700" title="This branch's price override applies to this drug">
          Branch price
        </span>
      );
    }
    if (source === "base_override") {
      return (
        <span className="ml-2 inline-block rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700" title='"All branches" price override applies to this drug'>
          All-branch price
        </span>
      );
    }
    return null;
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
          throw new Error(`Insufficient stock â€” ${shortages.join(" Â· ")}`);
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
        // the pre-flight) â€” cancel the invoice so we never keep a sale whose
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
          const detail = failed.map((f) => `${f.name}: ${f.reason}`).join(" Â· ");
          throw new Error(
            cancelled
              ? `Sale cancelled â€” dispense failed: ${detail}`
              : `Dispense failed: ${detail} â€” invoice ${body.data?.invoice_number ?? ""} was KEPT, please review it`
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
    <div className={modalBackdrop} role="dialog" aria-modal="true">
      <div className="my-4 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className={flexBetween}>
          <h3 className="text-lg font-bold">New counter sale</h3>
          <button type="button" onClick={onClose} className={ghostIconBtn} aria-label="Close">
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
              <label className={lbl} htmlFor="ns-disc">Discount (â‚¦)</label>
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
              placeholder="Search the catalogueâ€¦"
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
                      {[d.dosage, `â‚¦${Number(d.unitPrice ?? 0).toLocaleString()}`].filter(Boolean).join(" Â· ")}
                      {d.priceSource === "branch_override" && (
                        <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-700">branch price</span>
                      )}
                      {d.priceSource === "base_override" && (
                        <span className="ml-1 rounded bg-sky-100 px-1 py-0.5 text-[10px] font-semibold text-sky-700">all-branch price</span>
                      )}
                      {Number(d.inStock ?? 0) > 0 ? (
                        <span className="ml-1 font-semibold text-emerald-600">{Number(d.inStock)} in stock</span>
                      ) : (
                        <span className="ml-1 font-semibold text-red-500">out of stock</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--color-border)]">
            <table className={rowStart}>
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-muted)] text-xs uppercase text-[var(--color-muted-fg)]">
                  <th className="px-3 py-2 font-semibold">Drug</th>
                  <th className="px-3 py-2 font-semibold w-20">Qty</th>
                  <th className="px-3 py-2 font-semibold w-28">Unit price</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className={divideBorder}>
                {items.map((it, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2">
                      <span className="flex items-center text-[var(--color-foreground)]">
                        {it.name}
                        {priceSourceChip(it.priceSource)}
                      </span>
                    </td>
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
          <span className={mutedFg}>Subtotal {ngn(subtotal)}</span>
          {disc > 0 && <span className="text-red-500">âˆ’{ngn(disc)}</span>}
          <span className="text-xl font-bold">{ngn(total)}</span>
        </div>

        {error && <p role="alert" className="mt-3 rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">{error}</p>}

        <div className="mt-5 flex gap-3">
          <button type="button" onClick={onClose} className={btnGhost + " flex-1 justify-center py-2.5"}>Cancel</button>
          <button type="button" onClick={submit} disabled={busy || items.length === 0} className={btnPrimary + " flex-1 justify-center py-2.5"}>
            {busy ? "Creatingâ€¦" : "Create invoice"}
          </button>
        </div>
      </div>
    </div>
  );
}
