"use client";

import { useState } from "react";
import { errorBanner } from "@/lib/ui-constants";
import { inputCls, labelCls, PurchaseOrder, ModalShell } from "./vendor-purchasing-shared";

export function ReceiveGoodsModal({
  po,
  onClose,
  onReceived,
}: {
  po: PurchaseOrder;
  onClose: () => void;
  onReceived: () => Promise<void>;
}) {
  const pendingItems = po.items.filter((i) => (i.quantityOrdered ?? 0) - (i.quantityReceived ?? 0) > 0);
  const [lines, setLines] = useState(
    pendingItems.map((i) => ({
      key: i.id,
      poItemId: i.id,
      quantityReceived: String(Math.max(0, i.quantityOrdered - i.quantityReceived)),
      batchNumber: "",
      expiryDate: "",
      actualCost: String(i.unitCost),
      drugName: i.drugId,
    }))
  );
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const items = lines
        .filter((l) => Number(l.quantityReceived) > 0)
        .map((l) => ({
          poItemId: l.poItemId,
          quantityReceived: Number(l.quantityReceived),
          batchNumber: l.batchNumber,
          expiryDate: l.expiryDate || undefined,
          actualCost: l.actualCost ? Number(l.actualCost) : undefined,
        }));
      if (items.length === 0) throw new Error("At least one line must have a received quantity");
      const res = await fetch(`/api/pharmacy/procurement/purchase-orders/${po.id}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, notes: notes || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to receive goods");
      await onReceived();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to receive goods");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title={`Receive goods — ${po.poNumber}`} onClose={onClose}>
      <p className="mb-4 text-xs text-[var(--color-muted-fg)]">
        Receiving creates a goods received note (GRN), adds stock batches and updates inventory.
      </p>
      {po.items.length - lines.length > 0 && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          {po.items.length - lines.length} of {po.items.length} line(s) already received — showing only the {lines.length} line(s) still pending.
        </p>
      )}
      {lines.length === 0 && (
        <p className="rounded-lg border border-[var(--color-border)] px-3 py-4 text-sm text-[var(--color-muted-fg)]">
          All lines on this purchase order have been fully received.
        </p>
      )}
      <form onSubmit={submit} className="space-y-4">
        {lines.map((line) => {
          const item = po.items.find((i) => i.id === line.poItemId);
          const shortfall = (item?.quantityOrdered ?? 0) - (item?.quantityReceived ?? 0);
          return (
            <div key={line.key} className="rounded-lg border border-[var(--color-border)] p-3">
              <p className="text-sm font-medium text-[var(--color-foreground)]">
                Line · up to {shortfall} remaining
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div>
                  <label className={labelCls}>Qty received</label>
                  <input type="number" min={0} max={shortfall} step={1} required value={line.quantityReceived}
                    onChange={(e) => setLines((prev) => prev.map((l) => l.key === line.key ? { ...l, quantityReceived: e.target.value } : l))}
                    className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Batch number</label>
                  <input type="text" required value={line.batchNumber} placeholder="e.g. LOT-2026-01"
                    onChange={(e) => setLines((prev) => prev.map((l) => l.key === line.key ? { ...l, batchNumber: e.target.value } : l))}
                    className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Expiry date</label>
                  <input type="date" value={line.expiryDate}
                    onChange={(e) => setLines((prev) => prev.map((l) => l.key === line.key ? { ...l, expiryDate: e.target.value } : l))}
                    className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Actual unit cost</label>
                  <input type="number" min={0} step="0.01" value={line.actualCost}
                    onChange={(e) => setLines((prev) => prev.map((l) => l.key === line.key ? { ...l, actualCost: e.target.value } : l))}
                    className={inputCls} />
                </div>
              </div>
            </div>
          );
        })}

        <div>
          <label className={labelCls} htmlFor="grn-notes">Notes</label>
          <textarea id="grn-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} placeholder="Delivery note reference…" />
        </div>

        {error && (
          <p role="alert" className={errorBanner}>{error}</p>
        )}

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2.5 text-sm font-medium hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={busy || lines.length === 0} className="focus-ring flex-1 rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-60">
            {busy ? "Receiving…" : "Receive goods"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

