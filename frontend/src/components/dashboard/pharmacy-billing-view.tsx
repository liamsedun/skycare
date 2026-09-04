"use client";

import { useState } from "react";
import { Banknote, FileText, Receipt, ShieldCheck, Wallet } from "lucide-react";
import BranchFilter from "@/components/dashboard/branch-filter";
import { useBranch } from "@/lib/branch-context";
import type { AccessLevel } from "@/lib/nav";
import { ClaimsTab } from "./pharmacy/pharmacy-claims-tab";
import { CoverageTab } from "./pharmacy/pharmacy-coverage-tab";
import { PaymentsTab } from "./pharmacy/pharmacy-payments-tab";
import { ReportTab } from "./pharmacy/pharmacy-report-tab";
import { SalesTab } from "./pharmacy/pharmacy-sales-tab";

// ============================================================================
// Pharmacy Billing - sales invoices, multi-method payments, insurance claims,
// formulary coverage rules and the daily sales report.
// ============================================================================
type Tab = "sales" | "payments" | "claims" | "coverage" | "report";

const TABS: Array<{ id: Tab; label: string; icon: typeof Receipt }> = [
  { id: "sales", label: "Sales", icon: Receipt },
  { id: "payments", label: "Payments", icon: Wallet },
  { id: "claims", label: "Claims", icon: FileText },
  { id: "coverage", label: "Formulary", icon: ShieldCheck },
  { id: "report", label: "Daily report", icon: Banknote },
];

export default function PharmacyBillingView({ accessLevel = "full", myRole }: { accessLevel?: AccessLevel; myRole?: string }) {
  const viewOnly = accessLevel === "view_only";
  const [tab, setTab] = useState<Tab>("sales");
  const { selectedBranchId } = useBranch();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[var(--color-foreground)]">Pharmacy billing</h2>
          <p className="mt-0.5 text-sm text-[var(--color-muted-fg)]">
            Sales invoices, split payments, insurance claims and daily revenue.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BranchFilter value={selectedBranchId} onChange={() => {}} hideWhenSingle />
          <div className="flex gap-2" role="group" aria-label="Billing section">
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
      </div>

      {tab === "sales" && <SalesTab viewOnly={viewOnly} />}
      {tab === "payments" && <PaymentsTab viewOnly={viewOnly} />}
      {tab === "claims" && <ClaimsTab viewOnly={viewOnly} />}
      {tab === "coverage" && <CoverageTab viewOnly={viewOnly} />}
      {tab === "report" && <ReportTab viewOnly={viewOnly} />}
    </div>
  );
}
