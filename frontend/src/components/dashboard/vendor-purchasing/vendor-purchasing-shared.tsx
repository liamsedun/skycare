"use client";

import { Landmark, Wallet, CreditCard, ReceiptText, X } from "lucide-react";
import { modalBackdrop, flexBetween, ghostIconBtn } from "@/lib/ui-constants";

export const btnPrimary =
  "focus-ring inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60";
export const btnGhost =
  "focus-ring inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-muted-fg)] transition-colors duration-200 hover:bg-slate-50 disabled:opacity-60";
export const btnDanger =
  "focus-ring rounded-lg px-2.5 py-1.5 text-xs font-medium text-rose-600 transition-colors duration-200 hover:bg-rose-50 disabled:opacity-60";
export const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
export const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";

export const PO_STATUS_STYLES: Record<string, string> = {
  draft: "bg-amber-100 text-amber-700",
  sent: "bg-sky-100 text-sky-700",
  approved: "bg-indigo-100 text-indigo-700",
  received: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-slate-100 text-slate-500",
};

export const METHOD_LABELS: Record<string, string> = {
  bank_transfer: "Bank transfer",
  cash: "Cash",
  pos: "POS",
  credit_note: "Credit note",
};

export const METHOD_ICONS: Record<string, typeof Landmark> = {
  bank_transfer: Landmark,
  cash: Wallet,
  pos: CreditCard,
  credit_note: ReceiptText,
};

export interface SupplierBalance {
  supplierId: string;
  supplierName: string;
  code: string | null;
  totalOrdered: number;
  totalBought: number;
  totalPaid: number;
  outstanding: number;
  openingBought: number;
  openingPaid: number;
  poCount: number;
  paymentCount: number;
  lastBoughtAt: string | null;
  lastPaidAt: string | null;
}

export interface PoItem {
  id: string;
  drugId: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number;
  receivedCost: number;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  status: string;
  totalCost: number;
  notes: string | null;
  expectedBy: string | null;
  approvedAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  items: PoItem[];
}


export interface SupplierOption { id: string; name: string }

export interface PoDetailItem {
  id: string;
  drugName: string;
  unit: string | null;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number;
  receivedCost: number;
}

export interface GrnSummary {
  grnNumber: string;
  receivedAt: string;
  items: Array<{ drugName: string; quantityReceived: number; unitCost: number; batchNumber: string; expiryDate: string | null }>;
}

export interface PoDetail {
  id: string;
  poNumber: string;
  supplier: { name: string } | null;
  status: string;
  totalCost: number;
  notes: string | null;
  expectedBy: string | null;
  items: PoDetailItem[];
  grns: GrnSummary[];
}


export function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className={modalBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="my-4 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className={flexBetween}>
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} className={ghostIconBtn} aria-label="Close">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

