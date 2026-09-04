"use client";

import { useEffect, useState } from "react";
import { Building2, Search, Eye, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { formatNaira } from "@/lib/platform-utils";
import { PlatformGlassCard, PlatformPageHeader, StatusChip, PlatformSkeleton, PlatformEmpty } from "@/components/platform/platform-mobile-ui";

interface Tenant {
  id: string; name: string; slug: string; email: string; plan: string;
  subscription_status: string; is_active: boolean; trial_ends_at: string | null;
  created_at: string; userCount: number; patientCount: number; totalPaid: number; outstanding: number;
}

export default function PlatformTenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 10;

  const loadTenants = () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    if (planFilter) params.set("plan", planFilter);
    fetch(`/api/platform/tenants?${params}`, { credentials: "include" })
      .then(r => r.json()).then(d => { setTenants(d.data || []); setTotal(d.meta?.total || 0); })
      .catch(() => setTenants([])).finally(() => setLoading(false));
  };

  useEffect(() => { loadTenants(); }, [page, statusFilter, planFilter]);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); setPage(1); loadTenants(); };
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      <PlatformPageHeader title="Hospital Tenants" subtitle="Manage all hospitals on the platform" />

      <PlatformGlassCard className="!p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
          <form onSubmit={handleSearch} className="flex items-center gap-2 flex-1">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-fg)]" />
              <input type="text" placeholder="Search hospitals..." value={search} onChange={e => setSearch(e.target.value)}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] py-2.5 pl-10 pr-4 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition-all" />
            </div>
            <button type="submit" className="rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-600 transition-all platform-btn-gradient">Search</button>
          </form>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm focus:border-sky-500 focus:outline-none transition-all">
            <option value="">All Status</option>
            <option value="trial">Trial</option><option value="active">Active</option>
            <option value="past_due">Past Due</option><option value="suspended">Suspended</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select value={planFilter} onChange={e => { setPlanFilter(e.target.value); setPage(1); }}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm focus:border-sky-500 focus:outline-none transition-all">
            <option value="">All Plans</option>
            <option value="basic">Basic</option><option value="pro">Pro</option>
            <option value="enterprise">Enterprise</option><option value="custom">Custom</option>
          </select>
        </div>
      </PlatformGlassCard>

      <PlatformGlassCard className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-muted)]/30 text-left">
                <th className="px-5 py-3.5 font-medium text-xs uppercase tracking-wider text-[var(--color-muted-fg)]">Hospital</th>
                <th className="px-5 py-3.5 font-medium text-xs uppercase tracking-wider text-[var(--color-muted-fg)]">Plan</th>
                <th className="px-5 py-3.5 font-medium text-xs uppercase tracking-wider text-[var(--color-muted-fg)]">Status</th>
                <th className="px-5 py-3.5 font-medium text-xs uppercase tracking-wider text-[var(--color-muted-fg)]">Users</th>
                <th className="px-5 py-3.5 font-medium text-xs uppercase tracking-wider text-[var(--color-muted-fg)]">Patients</th>
                <th className="px-5 py-3.5 font-medium text-xs uppercase tracking-wider text-[var(--color-muted-fg)]">Revenue</th>
                <th className="px-5 py-3.5 font-medium text-xs uppercase tracking-wider text-[var(--color-muted-fg)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-5 py-12 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-sky-500" /></td></tr>
              ) : tenants.length === 0 ? (
                <tr><td colSpan={7}><PlatformEmpty icon={<Building2 className="h-7 w-7" />} title="No tenants found" hint="Try adjusting your search or filters" /></td></tr>
              ) : tenants.map(t => (
                <tr key={t.id} className="border-b border-[var(--color-border)] platform-table-row">
                  <td className="px-5 py-3.5">
                    <p className="font-medium">{t.name}</p>
                    <p className="text-xs text-[var(--color-muted-fg)]">{t.slug}.skycare.app</p>
                  </td>
                  <td className="px-5 py-3.5"><StatusChip status={t.plan} /></td>
                  <td className="px-5 py-3.5"><StatusChip status={t.subscription_status} /></td>
                  <td className="px-5 py-3.5 tabular-nums">{t.userCount}</td>
                  <td className="px-5 py-3.5 tabular-nums">{t.patientCount}</td>
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-emerald-600">{formatNaira(t.totalPaid)}</p>
                    {t.outstanding > 0 && <p className="text-xs text-orange-600">{formatNaira(t.outstanding)} due</p>}
                  </td>
                  <td className="px-5 py-3.5">
                    <Link href={`/platform/tenants/${t.id}`} className="inline-flex items-center gap-1.5 rounded-xl bg-sky-50 dark:bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-700 dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-sky-500/20 transition-all">
                      <Eye className="h-3.5 w-3.5" /> View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PlatformGlassCard>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-[var(--color-muted-fg)]">Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}</p>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
              className="rounded-xl border border-[var(--color-border)] p-2 transition-all hover:bg-[var(--color-muted)] disabled:opacity-40 active:scale-95"><ChevronLeft className="h-4 w-4" /></button>
            <span className="text-sm font-medium tabular-nums">{page} / {totalPages}</span>
            <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}
              className="rounded-xl border border-[var(--color-border)] p-2 transition-all hover:bg-[var(--color-muted)] disabled:opacity-40 active:scale-95"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}
