"use client";

import { ngn, formatDate } from "@/lib/auth";
import { labelCls, PO_STATUS_STYLES, PoDetail, ModalShell } from "./vendor-purchasing-shared";

export function PoDetailModal({ detail, onClose }: { detail: PoDetail; onClose: () => void }) {
  return (
    <ModalShell title={`${detail.poNumber} — ${detail.supplier?.name ?? "Supplier"}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-muted-fg)]">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${PO_STATUS_STYLES[detail.status] ?? ""}`}>
            {detail.status}
          </span>
          <span>Total: <strong className="text-[var(--color-foreground)]">{ngn(detail.totalCost)}</strong></span>
          {detail.expectedBy && <span>Expected {formatDate(detail.expectedBy)}</span>}
        </div>

        <div>
          <p className={labelCls}>Items</p>
          <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-muted)]/50 uppercase tracking-wider text-[var(--color-muted-fg)]">
                  <th className="px-3 py-2">Drug</th>
                  <th className="px-3 py-2">Ordered</th>
                  <th className="px-3 py-2">Received</th>
                  <th className="px-3 py-2">Unit cost</th>
                  <th className="px-3 py-2">Line total</th>
                </tr>
              </thead>
              <tbody>
                {detail.items.map((i) => (
                  <tr key={i.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-3 py-2 font-medium text-[var(--color-foreground)]">{i.drugName}</td>
                    <td className="px-3 py-2">{i.quantityOrdered}</td>
                    <td className="px-3 py-2">{i.quantityReceived}</td>
                    <td className="px-3 py-2">{ngn(i.unitCost)}</td>
                    <td className="px-3 py-2">{ngn(i.quantityReceived * i.unitCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {detail.grns.length > 0 && (
          <div>
            <p className={labelCls}>Goods received ({detail.grns.length})</p>
            <div className="space-y-2">
              {detail.grns.map((g) => (
                <div key={g.grnNumber} className="rounded-lg border border-[var(--color-border)] p-3">
                  <p className="text-xs font-semibold text-[var(--color-foreground)]">
                    {g.grnNumber} · {formatDate(g.receivedAt)}
                  </p>
                  <ul className="mt-1 space-y-0.5 text-xs text-[var(--color-muted-fg)]">
                    {g.items.map((gi, idx) => (
                      <li key={idx}>
                        {gi.drugName} × {gi.quantityReceived} @ {ngn(gi.unitCost)} — batch {gi.batchNumber}
                        {gi.expiryDate ? ` (exp ${gi.expiryDate})` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

