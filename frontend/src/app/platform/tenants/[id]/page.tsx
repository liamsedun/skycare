"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Mail, Phone, MapPin, Globe, Loader2, UserCog } from "lucide-react";
import Link from "next/link";
import { formatNaira } from "@/lib/platform-utils";
import { PlatformGlassCard, PlatformPageHeader, StatusChip } from "@/components/platform/platform-mobile-ui";

interface TenantDetail {
  id: string; name: string; slug: string; email: string; phone: string;
  address: string; city: string; state: string; country: string;
  plan: string; subscription_status: string; is_active: boolean;
  trial_ends_at: string | null; created_at: string; website_enabled: boolean;
  userCount: number; patientCount: number;
  invoices: Array<{ id: string; period_start: string; period_end: string; amount: number; discount_amount: number; status: string; created_at: string }>;
  couponUsage: Array<{ id: string; discount_amount: number; used_at: string; coupon: { code: string; discount_type: string; discount_value: number } }>;
}

export default function PlatformTenantDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(`/api/platform/tenants/${params.id}`, { credentials: "include" })
      .then(r => r.json()).then(d => setTenant(d.data)).catch(() => setMessage("Failed to load tenant")).finally(() => setLoading(false));
  }, [params.id]);

  useEffect(() => {
    if (message) { const t = setTimeout(() => setMessage(""), 4000); return () => clearTimeout(t); }
  }, [message]);

  const updateTenant = async (patch: Record<string, unknown>) => {
    setUpdating(true); setMessage("");
    try {
      const res = await fetch(`/api/platform/tenants/${params.id}`, { credentials: "include", method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const data = await res.json();
      if (data.success) { setTenant(prev => prev ? { ...prev, ...data.data } : null); setMessage("Updated successfully"); }
      else setMessage(data.error || "Update failed");
    } catch { setMessage("Network error"); } finally { setUpdating(false); }
  };

  const impersonate = async () => {
    setUpdating(true); setMessage("");
    try {
      const res = await fetch("/api/platform/impersonate", { credentials: "include", method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenant_id: tenant!.id }) });
      const data = await res.json();
      if (data.success) { setMessage(`Impersonation active — ${data.data.expires_in_seconds}s remaining. New tab opened.`); window.open(data.data.login_url, "_blank"); }
      else setMessage(data.error || "Failed");
    } catch { setMessage("Network error"); } finally { setUpdating(false); }
  };

  const deleteTenant = async () => {
    if (!confirm(`Delete "${tenant?.name}"? This cannot be undone.`)) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/platform/tenants/${params.id}`, { credentials: "include", method: "DELETE" });
      const data = await res.json();
      if (data.success) router.push("/platform/tenants");
      else setMessage(data.error || "Delete failed");
    } catch { setMessage("Network error"); } finally { setUpdating(false); }
  };

  if (loading) return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="h-10 w-10 rounded-lg bg-[var(--color-muted)] animate-pulse" />
        <div className="flex-1 space-y-2"><div className="h-7 w-48 rounded bg-[var(--color-muted)] animate-pulse" /><div className="h-4 w-32 rounded bg-[var(--color-muted)] animate-pulse" /></div>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="h-48 rounded-xl bg-[var(--color-muted)] animate-pulse lg:col-span-2" />
        <div className="space-y-4"><div className="h-20 rounded-xl bg-[var(--color-muted)] animate-pulse" /><div className="h-20 rounded-xl bg-[var(--color-muted)] animate-pulse" /><div className="h-20 rounded-xl bg-[var(--color-muted)] animate-pulse" /></div>
      </div>
      <div className="h-32 rounded-xl bg-[var(--color-muted)] animate-pulse" />
    </div>
  );

  if (!tenant) return <div className="py-20 text-center text-[var(--color-muted-fg)]">Tenant not found</div>;

  return (
    <div className="space-y-6 platform-stagger">
      <div className="flex items-center gap-4">
        <Link href="/platform/tenants" className="rounded-lg border border-[var(--color-border)] p-2 hover:bg-[var(--color-muted)]">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <PlatformPageHeader title={tenant.name} subtitle={`${tenant.slug}.skycare.app`}>
            <div className="flex items-center gap-2">
              <StatusChip status={tenant.plan} />
              <StatusChip status={tenant.subscription_status} />
            </div>
          </PlatformPageHeader>
        </div>
      </div>

      {message && (
        <div className={`rounded-lg px-4 py-3 text-sm ${message.includes("Updated") || message.includes("active") ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400" : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"}`}>
          {message}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <PlatformGlassCard className="lg:col-span-2">
          <h3 className="mb-4 text-lg font-semibold">Hospital Profile</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-center gap-3"><Mail className="h-4 w-4 text-[var(--color-muted-fg)]" /><span className="text-sm">{tenant.email ? <a href={`mailto:${tenant.email}`} className="hover:underline">{tenant.email}</a> : "—"}</span></div>
            <div className="flex items-center gap-3"><Phone className="h-4 w-4 text-[var(--color-muted-fg)]" /><span className="text-sm">{tenant.phone ? <a href={`tel:${tenant.phone}`} className="hover:underline">{tenant.phone}</a> : "—"}</span></div>
            <div className="flex items-center gap-3"><MapPin className="h-4 w-4 text-[var(--color-muted-fg)]" /><span className="text-sm">{[tenant.address, tenant.city, tenant.state, tenant.country].filter(Boolean).join(", ") || "—"}</span></div>
            <div className="flex items-center gap-3"><Globe className="h-4 w-4 text-[var(--color-muted-fg)]" /><span className="text-sm">{tenant.website_enabled ? "Website enabled" : "Website disabled"}</span></div>
          </div>
        </PlatformGlassCard>

        <div className="space-y-4">
          <PlatformGlassCard className="p-4"><div className="flex items-center justify-between"><span className="text-sm text-[var(--color-muted-fg)]">Users</span><span className="text-xl font-bold">{tenant.userCount}</span></div></PlatformGlassCard>
          <PlatformGlassCard className="p-4"><div className="flex items-center justify-between"><span className="text-sm text-[var(--color-muted-fg)]">Patients</span><span className="text-xl font-bold">{tenant.patientCount}</span></div></PlatformGlassCard>
          <PlatformGlassCard className="p-4"><div className="flex items-center justify-between"><span className="text-sm text-[var(--color-muted-fg)]">Trial Ends</span><span className="text-sm font-medium">{tenant.trial_ends_at ? new Date(tenant.trial_ends_at).toLocaleDateString() : "—"}</span></div></PlatformGlassCard>
        </div>
      </div>

      <PlatformGlassCard>
        <h3 className="mb-4 text-lg font-semibold">Subscription Management</h3>
        <div className="flex flex-wrap gap-3">
          {(tenant.subscription_status === "trial" || tenant.subscription_status === "past_due") && (
            <button onClick={() => updateTenant({ subscription_status: "active" })} disabled={updating} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              {tenant.subscription_status === "trial" ? "Activate" : "Resume"}
            </button>
          )}
          {tenant.subscription_status === "suspended" && (
            <button onClick={() => updateTenant({ subscription_status: "active" })} disabled={updating} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">Resume</button>
          )}
          {["trial", "active", "past_due"].includes(tenant.subscription_status) && (
            <button onClick={() => updateTenant({ subscription_status: "suspended" })} disabled={updating} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">Suspend</button>
          )}
          {tenant.subscription_status !== "cancelled" && (
            <button onClick={() => updateTenant({ subscription_status: "cancelled" })} disabled={updating} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">Cancel</button>
          )}
          <select value={tenant.plan} onChange={e => updateTenant({ plan: e.target.value })} disabled={updating} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none">
            <option value="basic">Basic</option><option value="pro">Pro</option><option value="enterprise">Enterprise</option><option value="custom">Custom</option>
          </select>
          <button onClick={() => updateTenant({ is_active: !tenant.is_active })} disabled={updating} className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${tenant.is_active ? "bg-orange-600 hover:bg-orange-700" : "bg-emerald-600 hover:bg-emerald-700"}`}>
            {tenant.is_active ? "Deactivate Account" : "Activate Account"}
          </button>
          <button onClick={() => updateTenant({ website_enabled: !tenant.website_enabled })} disabled={updating} className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${tenant.website_enabled ? "bg-gray-600 hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600" : "bg-indigo-600 hover:bg-indigo-700"}`}>
            {tenant.website_enabled ? "Disable Website" : "Enable Website"}
          </button>
          <button onClick={impersonate} disabled={updating} className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50">
            <UserCog className="h-4 w-4" /> Impersonate
          </button>
          <button onClick={deleteTenant} disabled={updating} className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20 disabled:opacity-50">
            Delete Tenant
          </button>
        </div>
      </PlatformGlassCard>

      <PlatformGlassCard>
        <h3 className="mb-4 text-lg font-semibold">Invoices</h3>
        {tenant.invoices.length === 0 ? <p className="text-sm text-[var(--color-muted-fg)]">No invoices yet</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[400px] text-sm">
              <thead><tr className="border-b border-[var(--color-border)] text-left">
                <th className="px-4 py-2 font-medium text-[var(--color-muted-fg)]">Period</th>
                <th className="px-4 py-2 font-medium text-[var(--color-muted-fg)]">Amount</th>
                <th className="px-4 py-2 font-medium text-[var(--color-muted-fg)]">Discount</th>
                <th className="px-4 py-2 font-medium text-[var(--color-muted-fg)]">Status</th>
              </tr></thead>
              <tbody>
                {tenant.invoices.map(inv => (
                  <tr key={inv.id} className="border-b border-[var(--color-border)] platform-table-row">
                    <td className="px-4 py-3">{new Date(inv.period_start).toLocaleDateString()} — {new Date(inv.period_end).toLocaleDateString()}</td>
                    <td className="px-4 py-3 font-medium">{formatNaira(Number(inv.amount))}</td>
                    <td className="px-4 py-3 text-emerald-600">{inv.discount_amount > 0 ? `-${formatNaira(Number(inv.discount_amount))}` : "—"}</td>
                    <td className="px-4 py-3"><span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${inv.status === "completed" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"}`}>{inv.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PlatformGlassCard>

      {tenant.couponUsage.length > 0 && (
        <PlatformGlassCard>
          <h3 className="mb-4 text-lg font-semibold">Coupon Usage</h3>
          <div className="space-y-3">
            {tenant.couponUsage.map(u => (
              <div key={u.id} className="flex items-center justify-between rounded-lg bg-[var(--color-muted)]/30 px-4 py-3">
                <div>
                  <span className="font-mono text-sm font-bold text-indigo-600">{u.coupon?.code}</span>
                  <span className="ml-2 text-sm text-[var(--color-muted-fg)]">
                    {u.coupon?.discount_type === "percent" ? `${u.coupon.discount_value}% off` : `${formatNaira(Number(u.coupon?.discount_value || 0))} off`}
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-emerald-600">{formatNaira(Number(u.discount_amount))} saved</p>
                  <p className="text-xs text-[var(--color-muted-fg)]">{new Date(u.used_at).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        </PlatformGlassCard>
      )}
    </div>
  );
}
