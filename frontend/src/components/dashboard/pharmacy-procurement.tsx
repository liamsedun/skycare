"use client";

import { Building2, Zap } from "lucide-react";
import { SuppliersTab } from "@/components/dashboard/pharmacy-admin-view";
import PharmacyAiView from "@/components/dashboard/pharmacy-ai-view";

// ============================================================================
// Pharmacy → Suppliers & Procurement — vendor management plus the AI
// auto-reorder engine that creates draft purchase orders per supplier.
// ============================================================================

export default function PharmacySuppliersProcurement() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Suppliers &amp; Procurement</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-fg)]">
          Vendor management and AI-driven purchase order creation.
        </p>
      </div>
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--color-foreground)]">
          <Building2 className="h-4 w-4 text-[var(--color-primary)]" /> Suppliers
        </h2>
        <SuppliersTab />
      </section>
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--color-foreground)]">
          <Zap className="h-4 w-4 text-[var(--color-primary)]" /> Auto-reorder &amp; purchase orders
        </h2>
        <PharmacyAiView />
      </section>
    </div>
  );
}