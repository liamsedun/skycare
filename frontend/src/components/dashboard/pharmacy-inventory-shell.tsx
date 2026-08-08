"use client";

import { useState } from "react";
import { Package, Pill, Upload } from "lucide-react";
import PharmacyStockView from "@/components/dashboard/pharmacy-stock-view";
import { DrugsTab, ImportTab } from "@/components/dashboard/pharmacy-admin-view";

// ============================================================================
// Pharmacy → Drug Inventory — stock levels & movements, catalogue, bulk import.
// ============================================================================

export default function PharmacyInventoryShell() {
  const [tab, setTab] = useState<"stock" | "drugs" | "import">("stock");

  const TABS = [
    { id: "stock" as const, label: "Stock", icon: Package },
    { id: "drugs" as const, label: "Drugs", icon: Pill },
    { id: "import" as const, label: "Bulk import", icon: Upload },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Drug Inventory</h1>
          <p className="mt-1 text-sm text-[var(--color-muted-fg)]">
            Stock levels, batch tracking, catalogue and bulk import.
          </p>
        </div>
        <div className="flex gap-2" role="group" aria-label="Inventory section">
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
      {tab === "import" && <ImportTab />}
    </div>
  );
}