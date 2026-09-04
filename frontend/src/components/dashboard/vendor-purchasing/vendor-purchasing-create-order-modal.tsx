"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { ngn } from "@/lib/auth";
import { useCurrency, currencySymbol } from "@/lib/currency";
import { mutedXs, errorBanner, mutedXsMt1 } from "@/lib/ui-constants";
import { inputCls, labelCls, SupplierOption, ModalShell } from "./vendor-purchasing-shared";

export interface OfferOption {
  drugId: string;
  drugName: string;
  unit: string | null;
  unitCost: number;
  minOrderQuantity: number;
  isPreferred: boolean;
}


export interface DrugOption {
  id: string;
  name: string;
  unit: string | null;
  supplierId: string | null;
}


export function CreateOrderModal({
  suppliers,
  onClose,
  onCreated,
}: {
  suppliers: SupplierOption[];
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [supplierId, setSupplierId] = useState("");
  const [offers, setOffers] = useState<OfferOption[]>([]);
  const [drugs, setDrugs] = useState<DrugOption[]>([]);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [cost, setCost] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [expectedBy, setExpectedBy] = useState("");
  const [drugSearch, setDrugSearch] = useState("");
  const [onlySupplierD, setOnlySupplierD] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { currency } = useCurrency();

  const loadDrugs = useCallback(async () => {
    try {
      const res = await fetch("/api/pharmacy/drugs", { cache: "no-store" });
      const body = await res.json();
      setDrugs(
        res.ok
          ? (body.data ?? []).map((d: { id: string; name: string; form: string | null; supplierId: string | null }) => ({
              id: d.id,
              name: d.name,
              unit: d.form || null,
              supplierId: d.supplierId ?? null,
            }))
          : []
      );
    } catch {
      setDrugs([]);
    }
  }, []);

  useEffect(() => {
    void loadDrugs();
  }, [loadDrugs]);

  const drugOptions = useMemo(() => {
    const map = new Map<string, DrugOption>();
    for (const d of drugs) map.set(d.id, d);
    for (const o of offers) if (!map.has(o.drugId)) map.set(o.drugId, { id: o.drugId, name: o.drugName, unit: o.unit, supplierId: null });
    return Array.from(map.values());
  }, [drugs, offers]);

  const supplierDrugIds = useMemo(() => {
    const ids = new Set<string>();
    for (const o of offers) ids.add(o.drugId);
    for (const d of drugs) if (d.supplierId && d.supplierId === supplierId) ids.add(d.id);
    return ids;
  }, [offers, drugs, supplierId]);

  const visibleDrugs = useMemo(() => {
    const q = drugSearch.trim().toLowerCase();
    let list = drugOptions;
    if (onlySupplierD) list = list.filter((d) => supplierDrugIds.has(d.id));
    if (q) list = list.filter((d) => d.name.toLowerCase().includes(q));
    return [...list].sort((a, b) => {
      const ap = supplierDrugIds.has(a.id) ? 0 : 1;
      const bp = supplierDrugIds.has(b.id) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return a.name.localeCompare(b.name);
    });
  }, [drugOptions, supplierDrugIds, onlySupplierD, drugSearch]);

  const loadOffers = useCallback(async (sid: string) => {
    if (!sid) { setOffers([]); return; }
    try {
      const res = await fetch(`/api/pharmacy/procurement/supplier-offers?supplier_id=${sid}`, { cache: "no-store" });
      const body = await res.json();
      const list = res.ok ? (body.data ?? []) : [];
      setOffers(list);
      setCost((prev) => {
        const next = { ...prev };
        for (const o of list) if (!next[o.drugId]) next[o.drugId] = String(o.unitCost);
        return next;
      });
    } catch {
      setOffers([]);
    }
  }, []);

  function pickSupplier(sid: string) {
    setSupplierId(sid);
    setOnlySupplierD(false);
    void loadOffers(sid);
  }

  const choseCount = Object.keys(qty).filter((id) => Number(qty[id]) > 0).length;
  const total = drugOptions.reduce(
    (sum, d) => sum + (Number(qty[d.id]) || 0) * (Number(cost[d.id]) || 0),
    0
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const items = drugOptions
        .filter((d) => Number(qty[d.id]) > 0)
        .map((d) => ({
          drugId: d.id,
          quantity: Number(qty[d.id]),
          unitCost: Number(cost[d.id]) || 0,
        }));
      if (items.length === 0) throw new Error("Enter a quantity for at least one drug");
      const res = await fetch("/api/pharmacy/procurement/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierId, items, notes: notes || undefined, expectedBy: expectedBy || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to create purchase order");
      await onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create purchase order");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="New purchase order" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={labelCls} htmlFor="po-supplier">Supplier</label>
          <select id="po-supplier" required value={supplierId} onChange={(e) => pickSupplier(e.target.value)} className={inputCls}>
            <option value="">Select supplier…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {supplierId && offers.length === 0 && (
            <p className={mutedXsMt1}>
              No pricing offers on file for this supplier — enter unit costs manually.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={labelCls + " mb-0"}>
              Drug lines {choseCount > 0 && <span className="text-xs font-medium text-[var(--color-muted-fg)]">· {choseCount} chosen</span>}
            </p>
            {supplierId && (
              <label className="flex items-center gap-1.5 text-xs text-[var(--color-muted-fg)]">
                <input
                  type="checkbox"
                  checked={onlySupplierD}
                  onChange={(e) => setOnlySupplierD(e.target.checked)}
                  className="accent-[var(--color-primary)]"
                />
                Only {suppliers.find((s) => s.id === supplierId)?.name ?? "this supplier"}’s drugs
              </label>
            )}
          </div>

          {drugOptions.length > 0 && (
            <div className="relative">
              <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-fg)]" />
              <input
                value={drugSearch}
                onChange={(e) => setDrugSearch(e.target.value)}
                placeholder="Search the catalogue…"
                className={inputCls + " pl-9"}
                aria-label="Search drugs"
              />
            </div>
          )}

          {drugOptions.length === 0 ? (
            <p className="rounded-lg border border-[var(--color-border)] px-3 py-4 text-sm text-[var(--color-muted-fg)]">
              No drugs in the catalog yet — add drugs from the pharmacy inventory first.
            </p>
          ) : visibleDrugs.length === 0 ? (
            <p className="rounded-lg border border-[var(--color-border)] px-3 py-4 text-sm text-[var(--color-muted-fg)]">
              {onlySupplierD && supplierDrugIds.size === 0 ? (
                <>
                  No drugs are linked to <span className="font-semibold">{suppliers.find((s) => s.id === supplierId)?.name ?? "this supplier"}</span> yet — link drugs to it in Pharmacy → Inventory (the Supplier column) or in the drug CSV import, and they will pin to the top here. For now, turn this toggle off to pick from the full catalogue.
                </>
              ) : (
                "No drugs match this search."
              )}
            </p>
          ) : (
            <>
              <div className="max-h-[45vh] overflow-y-auto rounded-xl border border-[var(--color-border)]">
                <div className="grid grid-cols-12 gap-2 border-b border-[var(--color-border)] bg-[var(--color-muted)]/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">
                  <span className="col-span-6">Drug</span>
                  <span className="col-span-3">Qty</span>
                  <span className="col-span-3 text-right">Unit cost ({currencySymbol(currency)})</span>
                </div>
                {visibleDrugs.map((d) => {
                  const offer = offers.find((o) => o.drugId === d.id);
                  const pinned = supplierDrugIds.has(d.id);
                  return (
                    <div key={d.id} className={`grid grid-cols-12 items-center gap-2 border-b border-[var(--color-border)] px-3 py-2 last:border-b-0 ${Number(qty[d.id]) > 0 ? "bg-[var(--color-primary-soft)]/50" : ""}`}>
                      <div className="col-span-6 min-w-0">
                        <p className="truncate text-sm font-medium text-[var(--color-foreground)]" title={d.name}>
                          {d.name}{d.unit ? ` (${d.unit})` : ""}
                          {offer?.isPreferred ? <span className="ml-1 text-amber-500" title="Preferred supplier">★</span> : null}
                        </p>
                        {pinned && !offer && (
                          <p className="text-[10px] text-[var(--color-muted-fg)]">Tagged to this supplier</p>
                        )}
                      </div>
                      <div className="col-span-3">
                        <input
                          type="number" min={1} step={1} placeholder="0"
                          value={qty[d.id] ?? ""}
                          onChange={(e) => setQty((prev) => ({ ...prev, [d.id]: e.target.value }))}
                          className={inputCls + " px-2 py-1.5"}
                          aria-label={`Quantity for ${d.name}`}
                        />
                      </div>
                      <div className="col-span-3">
                        <input
                          type="number" min={0} step="0.01" placeholder="0.00"
                          value={cost[d.id] ?? ""}
                          onChange={(e) => setCost((prev) => ({ ...prev, [d.id]: e.target.value }))}
                          className={inputCls + " px-2 py-1.5 text-right"}
                          aria-label={`Unit cost for ${d.name}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              {supplierId && supplierDrugIds.size === 0 && (
                <p className={mutedXs}>
                  None of your catalog drugs are tagged to this supplier yet — tag them in Pharmacy → Admin → Drugs so they pin to the top here. You can still order any drug manually.
                </p>
              )}
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="po-expected">Expected by (optional)</label>
            <input id="po-expected" type="date" value={expectedBy} onChange={(e) => setExpectedBy(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Order total</label>
            <p className="rounded-lg bg-[var(--color-muted)]/60 px-3 py-2 text-base font-bold text-[var(--color-foreground)]">
              {ngn(total)}
            </p>
          </div>
        </div>

        <div>
          <label className={labelCls} htmlFor="po-notes">Notes</label>
          <textarea id="po-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} placeholder="Delivery instructions, payment terms…" />
        </div>

        {error && (
          <p role="alert" className={errorBanner}>{error}</p>
        )}

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2.5 text-sm font-medium hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={busy || !supplierId} className="focus-ring flex-1 rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-60">
            {busy ? "Creating…" : "Create order (draft)"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

