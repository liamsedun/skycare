"use client";

import { mutedSm, divideBorder, mutedSmPlain, pageTitle } from "@/lib/ui-constants";
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
  subscription_status: string | null;
  is_active: boolean;
  created_at: string;
}

const PLANS = ["basic", "pro", "enterprise", "custom"];

function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function planBadge(plan: string) {
  const color =
    plan === "enterprise"
      ? "bg-indigo-50 text-indigo-700"
      : plan === "pro"
        ? "bg-sky-50 text-sky-700"
        : plan === "custom"
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
  if (["paid"].includes(s)) return <Badge cls="bg-emerald-50 text-emerald-700" label={status} />;
  if (s === "pending") return <Badge cls="bg-amber-50 text-amber-700" label={status} />;
  if (["failed", "cancelled"].includes(s)) return <Badge cls="bg-rose-50 text-rose-700" label={status} />;
  return <Badge cls="bg-slate-100 text-slate-600" label={status} />;
}

function Badge({ cls, label }: { cls: string; label: string }) {
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  );
}

function subscriptionBadge(status: string | null | undefined) {
  const s = (status ?? "trial").toLowerCase();
  switch (s) {
    case "active":
      return <Badge cls="bg-emerald-50 text-emerald-700" label="Active" />;
    case "trial":
      return <Badge cls="bg-sky-50 text-sky-700" label="Trial" />;
    case "suspended":
      return <Badge cls="bg-amber-50 text-amber-700" label="Suspended" />;
    case "past_due":
      return <Badge cls="bg-orange-50 text-orange-700" label="Past due" />;
    case "cancelled":
      return <Badge cls="bg-rose-50 text-rose-700" label="Cancelled" />;
    default:
      return <Badge cls="bg-slate-100 text-slate-600" label={status ?? "Trial"} />;
  }
}

export default function SubscriptionView() {
  const [tenant, setTenant] = useState<TenantPlan | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    setNotice(null);
    try {
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
  };

  const act = async (action: string, plan?: string) => {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/subscription", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, plan }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Request failed");
        return;
      }
      setTenant(body.data.tenant);
      setNotice(
        action === "change-plan"
          ? `Plan changed to ${plan}.`
          : `Subscription ${actionVerbs[action] ?? action}.`
      );
    } catch {
      setError("Something went wrong");
    } finally {
      setBusy(null);
    }
  };

  const actionVerbs: Record<string, string> = {
    activate: "activated",
    suspend: "suspended",
    resume: "resumed",
    cancel: "cancelled",
  };

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
        await load(true);
      } catch {
        setError("Something went wrong");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function isAdminRole(r: string | null | undefined): boolean {
    return r === "hospital_admin" || r === "super_admin";
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-[var(--color-muted-fg)]">
        <Loader2 size={16} className="mr-2 animate-spin" aria-hidden="true" />
        Loading…
      </div>
    );
  }

  if (error && !tenant) {
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

  const status = tenant?.subscription_status ?? "trial";
  const trialActive =
    status !== "cancelled" &&
    status !== "suspended" &&
    tenant?.trial_ends_at
      ? new Date(tenant.trial_ends_at) > new Date()
      : false;

  const btnCls =
    "rounded-lg px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="space-y-6">
      <div>
        <h1 className={pageTitle}>Subscription &amp; billing</h1>
        <p className={mutedSm}>
          Your hospital&apos;s SkyCare SaaS plan and payment history.
        </p>
      </div>

      {notice && (
        <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      )}

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
              <p className={mutedSmPlain}>
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
              <p className="text-xs uppercase tracking-wide text-[var(--color-muted-fg)]">Status</p>
              <div className="mt-1">{subscriptionBadge(tenant.subscription_status)}</div>
            </div>
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
        {status === "suspended" && (
          <div className="mt-6 rounded-lg bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            This subscription has been suspended — your public site is showing a temporary
            unavailable notice. Resume the subscription to restore full access.
          </div>
        )}
        {status === "cancelled" && (
          <div className="mt-6 rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
            This subscription has been cancelled. To restore service, contact the SkyCare team —
            the plan can still be changed from here.
          </div>
        )}

        {isAdmin && tenant && (
          <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] pt-5">
            <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">
              Manage subscription
            </span>
            {status === "trial" || status === "past_due" ? (
              <button
                onClick={() => act("activate")}
                disabled={busy !== null}
                className={`${btnCls} bg-emerald-600 text-white hover:bg-emerald-700`}
              >
                {busy === "activate" && <Loader2 size={14} className="mr-1 inline animate-spin" />}
                Activate subscription
              </button>
            ) : null}
            {status === "suspended" ? (
              <button
                onClick={() => act("resume")}
                disabled={busy !== null}
                className={`${btnCls} bg-emerald-600 text-white hover:bg-emerald-700`}
              >
                {busy === "resume" && <Loader2 size={14} className="mr-1 inline animate-spin" />}
                Resume subscription
              </button>
            ) : null}
            {["trial", "active", "past_due"].includes(status) ? (
              <button
                onClick={() => act("suspend")}
                disabled={busy !== null}
                className={`${btnCls} bg-amber-600 text-white hover:bg-amber-700`}
              >
                {busy === "suspend" && <Loader2 size={14} className="mr-1 inline animate-spin" />}
                Suspend
              </button>
            ) : null}
            {status !== "cancelled" ? (
              <button
                onClick={() => {
                  if (window.confirm("Cancel this subscription? The public site will show an unavailable notice.")) {
                    void act("cancel");
                  }
                }}
                disabled={busy !== null}
                className={`${btnCls} bg-rose-600 text-white hover:bg-rose-700`}
              >
                {busy === "cancel" && <Loader2 size={14} className="mr-1 inline animate-spin" />}
                Cancel subscription
              </button>
            ) : null}
            <select
              value={tenant.plan}
              onChange={(e) => act("change-plan", e.target.value)}
              disabled={busy !== null}
              className="ml-auto rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-medium text-[var(--color-foreground)]"
              aria-label="Change plan"
            >
              {PLANS.map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0).toUpperCase() + p.slice(1)} plan
                </option>
              ))}
            </select>
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
              <tbody className={divideBorder}>
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