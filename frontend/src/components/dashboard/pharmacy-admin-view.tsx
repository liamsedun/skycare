"use client";

import { useState } from "react";
import { Pill, Package, Building2, Store, Tag, Upload } from "lucide-react";
import PharmacyStockView from "@/components/dashboard/pharmacy-stock-view";
import { DrugsTab } from "./pharmacy-admin/pharmacy-drugs-tab";
import { SuppliersTab } from "./pharmacy-admin/pharmacy-suppliers-tab";
import { PricesTab } from "./pharmacy-admin/pharmacy-prices-tab";
import { ImportTab } from "./pharmacy-admin/pharmacy-import-tab";
import { BranchesTab } from "./pharmacy-admin/pharmacy-branches-tab";

// ============================================================================
// Pharmacy Admin â€” catalogue administration for hospital admins:
//   Drugs     : search / add / edit / archive catalogue entries
//   Suppliers : add local vendors
//   Prices    : branch-specific retail price overrides
//   Import    : CSV bulk upload with row-by-row report
// ============================================================================

type Tab = "stock" | "drugs" | "suppliers" | "branches" | "prices" | "import";

const TABS: Array<{ id: Tab; label: string; icon: typeof Pill }> = [
  { id: "stock", label: "Stock", icon: Package },
  { id: "drugs", label: "Drugs", icon: Pill },
  { id: "suppliers", label: "Suppliers", icon: Building2 },
  { id: "branches", label: "Branches", icon: Store },
  { id: "prices", label: "Branch prices", icon: Tag },
  { id: "import", label: "Bulk import", icon: Upload },
];

export default function PharmacyAdminView() {
  const [tab, setTab] = useState<Tab>("drugs");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[var(--color-foreground)]">Pharmacy administration</h2>
          <p className="mt-0.5 text-sm text-[var(--color-muted-fg)]">Catalogue, suppliers, branch pricing and bulk import.</p>
        </div>
        <div className="flex gap-2" role="group" aria-label="Admin section">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-pressed={tab === t.id}
              className={`focus-ring inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors duration-200 ${
                tab === t.id ? "bg-[var(--color-primary)] text-white" : "border border-[var(--color-border)] text-[var(--color-muted-fg)] hover:bg-slate-50"
              }`}
            >
              <t.icon size={14} aria-hidden="true" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "stock" && <PharmacyStockView />}
      {tab === "drugs" && <DrugsTab />}
      {tab === "suppliers" && <SuppliersTab />}
      {tab === "branches" && <BranchesTab />}
      {tab === "prices" && <PricesTab />}
      {tab === "import" && <ImportTab />}
    </div>
  );
}
export { DrugFormModal, type DrugRow, type CategoryRow } from "./pharmacy-admin/pharmacy-drugs-tab";
export { SuppliersTab } from "./pharmacy-admin/pharmacy-suppliers-tab";
export { PricesTab } from "./pharmacy-admin/pharmacy-prices-tab";
export { ImportTab } from "./pharmacy-admin/pharmacy-import-tab";
export { BranchAdminTabs, BranchesTab } from "./pharmacy-admin/pharmacy-branches-tab";