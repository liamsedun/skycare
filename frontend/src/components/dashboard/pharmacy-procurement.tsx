"use client";

import { useState } from "react";
import { Building2, Landmark, Package, ReceiptText, Zap } from "lucide-react";
import { SuppliersTab } from "@/components/dashboard/pharmacy-admin-view";
import PharmacyAiView from "@/components/dashboard/pharmacy-ai-view";
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
  { id: "suppliers", label: "Suppliers", icon: Building2 },
  { id: "balances", label: "Balances", icon: Landmark },
  { id: "orders", label: "Purchase orders", icon: Package },
  { id: "payments", label: "Payments", icon: ReceiptText },
  { id: "auto", label: "Auto-reorder", icon: Zap },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function PharmacySuppliersProcurement() {
  const [tab, setTab] = useState<TabId>("suppliers");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Suppliers &amp; Procurement</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-fg)]">
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
          <SuppliersTab />
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
