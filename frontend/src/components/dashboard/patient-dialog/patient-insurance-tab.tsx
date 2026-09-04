"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, Loader2 } from "lucide-react";
import { formatCurrency, useCurrency } from "@/lib/currency";
import { errorBanner, flexGap2, mutedFg } from "@/lib/ui-constants";

interface PatientPolicy {
  id: string;
  policy_number: string;
  plan_name: string | null;
  coverage_type: string;
  copay_percent: number | null;
  status: string;
  effective_date: string;
  expiry_date: string | null;
  insurance_providers: { name: string; code: string | null } | null;
}

const COVERAGE_CLS: Record<string, string> = {
  full: "bg-emerald-100 text-emerald-700",
  partial: "bg-sky-100 text-sky-700",
  co_pay: "bg-amber-100 text-amber-700",
};

const STATUS_CLS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  suspended: "bg-amber-100 text-amber-700",
  expired: "bg-red-100 text-red-700",
};

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

export default function PatientInsuranceTab({ patientId }: { patientId: string }) {
  const { currency } = useCurrency();
  const fmt = useCallback((n: number | null | undefined) => formatCurrency(n ?? 0, currency), [currency]);
  const [policies, setPolicies] = useState<PatientPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/insurance/eligibility?patient_id=${patientId}`, { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? "Failed to load insurance");
      }
      const body = await res.json();
      setPolicies(body.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load insurance");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={20} className="animate-spin text-[var(--color-primary)]" />
        <span className="ml-2 text-sm text-[var(--color-muted-fg)]">Loading insurance…</span>
      </div>
    );
  }

  if (error) {
    return <p role="alert" className={errorBanner}>{error}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--color-foreground)]">Active Insurance Policies</h3>
      </div>

      {policies.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] py-8 text-center">
          <ShieldCheck size={32} aria-hidden="true" className="mx-auto text-[var(--color-muted-fg)]" />
          <p className="mt-2 text-sm text-[var(--color-muted-fg)]">No insurance policies on file.</p>
          <p className="mt-1 text-xs text-[var(--color-muted-fg)]">
            Add a policy from the Insurance module to enable coverage tracking.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {policies.map((p) => (
            <div key={p.id} className="rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-sm)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className={flexGap2}>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${COVERAGE_CLS[p.coverage_type] ?? "bg-slate-100 text-slate-600"}`}>
                      {p.coverage_type === "co_pay" ? "Co-pay" : p.coverage_type}
                    </span>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_CLS[p.status] ?? "bg-slate-100 text-slate-600"}`}>
                      {p.status}
                    </span>
                  </div>
                  <p className="mt-1.5 font-mono text-sm font-semibold text-[var(--color-foreground)]">
                    {p.policy_number}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--color-muted-fg)]">
                    {p.insurance_providers?.name ?? "Unknown provider"}
                    {p.plan_name ? ` · ${p.plan_name}` : ""}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className={mutedFg}>Provider</span>
                  <p className="font-medium">{p.insurance_providers?.name ?? "—"}</p>
                </div>
                <div>
                  <span className={mutedFg}>Co-pay</span>
                  <p className="font-medium">{p.copay_percent != null ? `${p.copay_percent}%` : "—"}</p>
                </div>
                <div>
                  <span className={mutedFg}>Expires</span>
                  <p className="font-medium">{fmtDate(p.expiry_date)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
