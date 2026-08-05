"use client";

import { useEffect, useState } from "react";
import { Building2, Loader2, ShieldX } from "lucide-react";

const cardCls = "rounded-xl border border-[var(--color-border)] bg-white p-6 shadow-sm";

interface Invoice {
  id: string;
  period_start: string;
  period_end: string;
  amount: number;
  currency: string;
  status: string;
  provider: string | null;
  provider_ref: string | null;
  created_at: string;
}

interface TenantPlan {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  plan: string;
  currency: string;
  trial_ends_at: string | null;
  is_active: boolean;
  created_at: string;
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function planBadge(plan: string) {
  const color =
    plan === "enterprise"
      ? "bg-indigo-50 text-indigo-700"
      : plan === "growth"
        ? "bg-sky-50 text-sky-700"
        : plan === "scale"
          ? "bg-violet-50 text-violet-700"
          : "bg-slate-100 text-slate-700";
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${color}`}>
      {plan}
    </span>
  );
}

function statusBadge(status: string) {
  const s = status?.toLowerCase() ?? "";
  const cls =
    s === "paid"
      ? "bg-emerald-50 text-emerald-700"
      : s === "pending"
        ? "bg-amber-50 text-amber-700"
        : s === "failed" || s === "cancelled"
          ? "bg-rose-50 text-rose-700"
          : "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {status}
    </span>
  );
}

export default function SubscriptionView() {
  const [tenant, setTenant] = useState<TenantPlan | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const meRes = await fetch("/api/auth/me", { cache: "no-store" });
        const meBody = await meRes.json();
        const role = meBody.data?.claims?.role ?? null;
        setIsAdmin(role === "hospital_admin" || role === "super_admin");
        if (!isAdminRole(role)) {
          setError("Only hospital administrators can view subscription billing.");
          setLoading(false);
          return;
        }
        const res = await fetch("/api/subscription", { cache: "no-store" });
        const body = await res.json();
        if (!res.ok) {
          setError(body.error ?? "Failed to load subscription");
          return;
        }
        setTenant(body.data.tenant);
        setInvoices(body.data.invoices ?? []);
      } catch {
        setError("Something went wrong");
      } finally {
        setLoading(false);
      }
    })();
    function isAdminRole(r: string | null | undefined): boolean {
      return r === "hospital_admin" || r === "super_admin";
    }
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-[var(--color-muted-fg)]">
        <Loader2 size={16} className="mr-2 animate-spin" aria-hidden="true" />
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${cardCls} mx-auto max-w-xl text-center`}>
        <ShieldX size={28} className="mx-auto text-rose-500" aria-hidden="true" />
        <p className="mt-3 text-sm font-medium text-rose-600">{error}</p>
        <p className="mt-2 text-sm text-[var(--color-muted-fg)]">
          Subscription billing is available to hospital administrators and super admins only.
        </p>
      </div>
    );
  }

  const trialActive = tenant?.trial_ends_at
    ? new Date(tenant.trial_ends_at) > new Date()
    : false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Subscription &amp; billing</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-fg)]">
          Your hospital&apos;s SkyCare SaaS plan and payment history.
        </p>
      </div>

      <div className={cardCls}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]">
              <Building2 size={22} aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--color-foreground)]">
                {tenant?.name ?? "Hospital"}
              </h2>
              <p className="text-sm text-[var(--color-muted-fg)]">
                {tenant?.email ?? "—"} · {tenant?.slug ?? "your-hospital"}.skycare.app
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-[var(--color-muted-fg)]">Current plan</p>
            <div className="mt-1">{planBadge(tenant?.plan ?? "basic")}</div>
          </div>
        </div>

        {tenant && (
          <div className="mt-6 grid grid-cols-2 gap-4 border-t border-[var(--color-border)] pt-6 sm:grid-cols-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--color-muted-fg)]">Plan</p>
              <p className="mt-1 text-sm font-medium capitalize text-[var(--color-foreground)]">
                {tenant.plan}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--color-muted-fg)]">Trial ends</p>
              <p className="mt-1 text-sm font-medium text-[var(--color-foreground)]">
                {fmtDate(tenant.trial_ends_at)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--color-muted-fg)]">Status</p>
              <p className="mt-1 text-sm font-medium text-[var(--color-foreground)]">
                {tenant.is_active ? "Active" : "Suspended"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--color-muted-fg)]">Signed up</p>
              <p className="mt-1 text-sm font-medium text-[var(--color-foreground)]">
                {fmtDate(tenant.created_at)}
              </p>
            </div>
          </div>
        )}

        {trialActive && tenant?.trial_ends_at && (
          <div className="mt-6 rounded-lg bg-[var(--color-primary-soft)] px-4 py-3 text-sm text-[var(--color-primary-dark)]">
            You are on a free trial until {fmtDate(tenant.trial_ends_at)}. Upgrade to continue
            uninterrupted access to SkyCare.
          </div>
        )}
      </div>

      <div className={cardCls}>
        <h2 className="text-base font-bold text-[var(--color-foreground)]">Invoices</h2>
        {invoices.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--color-muted-fg)]">
            No invoices yet — you will see billing history here once your plan is active.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-muted-fg)]">
                  <th className="pb-2 pr-4 font-semibold">Period</th>
                  <th className="pb-2 pr-4 font-semibold">Amount</th>
                  <th className="pb-2 pr-4 font-semibold">Status</th>
                  <th className="pb-2 pr-4 font-semibold">Provider</th>
                  <th className="pb-2 font-semibold">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="py-3 pr-4 text-[var(--color-foreground)]">
                      {fmtDate(inv.period_start)} – {fmtDate(inv.period_end)}
                    </td>
                    <td className="py-3 pr-4 font-medium text-[var(--color-foreground)]">
                      {formatAmount(inv.amount, inv.currency)}
                    </td>
                    <td className="py-3 pr-4">{statusBadge(inv.status)}</td>
                    <td className="py-3 pr-4 capitalize text-[var(--color-muted-fg)]">
                      {inv.provider ?? "—"}
                    </td>
                    <td className="py-3 font-mono text-xs text-[var(--color-muted-fg)]">
                      {inv.provider_ref ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function formatAmount(amount: number, currency: string | null | undefined): string {
  const cur = (currency || "NGN").toUpperCase();
  if (cur === "NGN") {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 0,
    }).format(Number(amount));
  }
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: cur,
    maximumFractionDigits: 2,
  }).format(Number(amount));
}