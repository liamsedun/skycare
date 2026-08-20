"use client";

import { useState } from "react";
import { Building2, Landmark, Package, ReceiptText, Zap } from "lucide-react";
import { SuppliersTab } from "@/components/dashboard/pharmacy-admin-view";
import PharmacyAiView from "@/components/dashboard/pharmacy-ai-view";
import type { AccessLevel } from "@/lib/nav";
import { mutedSm, pageTitle } from "@/lib/ui-constants";
import {
  BalancesTab,
  PurchaseOrdersTab,
  PaymentsTab,
} from "@/components/dashboard/vendor-purchasing";

// ============================================================================
// Pharmacy → Suppliers & Procurement — vendor management (suppliers, balances,
// purchase orders, instant payments) plus the AI auto-reorder engine.
// ============================================================================

const TABS = [
  { id: "balances", label: "Balances", icon: Landmark },
  { id: "orders", label: "Purchase orders", icon: Package },
  { id: "payments", label: "Payments", icon: ReceiptText },
  { id: "suppliers", label: "Suppliers", icon: Building2 },
  { id: "auto", label: "Auto-reorder", icon: Zap },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function PharmacySuppliersProcurement({ accessLevel = "full", myRole }: { accessLevel?: AccessLevel; myRole?: string }) {
  const viewOnly = accessLevel === "view_only";
  const [tab, setTab] = useState<TabId>("balances");

  return (
    <div className="space-y-6">
      <div>
        <h1 className={pageTitle}>Suppliers &amp; Procurement</h1>
        <p className={mutedSm}>
          Order drugs from suppliers, pay by bank transfer or on credit, and track what each
          supplier is owed.
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Suppliers and procurement sections"
        className="flex flex-wrap gap-1.5 rounded-xl border border-[var(--color-border)] bg-white p-1.5"
      >
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`focus-ring inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 ${
              tab === id
                ? "bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]"
                : "text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)]/50"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {tab === "suppliers" && (
        <section className="space-y-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--color-foreground)]">
            <Building2 className="h-4 w-4 text-[var(--color-primary)]" /> Suppliers
          </h2>
          <SuppliersTab viewOnly={viewOnly} />
        </section>
      )}
      {tab === "balances" && (
        <section className="space-y-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--color-foreground)]">
            <Landmark className="h-4 w-4 text-[var(--color-primary)]" /> Supplier balances
          </h2>
          <BalancesTab />
        </section>
      )}
      {tab === "orders" && (
        <section className="space-y-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--color-foreground)]">
            <Package className="h-4 w-4 text-[var(--color-primary)]" /> Purchase orders
          </h2>
          <PurchaseOrdersTab />
        </section>
      )}
      {tab === "payments" && (
        <section className="space-y-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--color-foreground)]">
            <ReceiptText className="h-4 w-4 text-[var(--color-primary)]" /> Supplier payments
          </h2>
          <PaymentsTab />
        </section>
      )}
      {tab === "auto" && (
        <section className="space-y-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--color-foreground)]">
            <Zap className="h-4 w-4 text-[var(--color-primary)]" /> Auto-reorder
          </h2>
          <PharmacyAiView />
        </section>
      )}
    </div>
  );
}
