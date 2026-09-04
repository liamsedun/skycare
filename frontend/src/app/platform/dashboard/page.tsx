"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Building2, CreditCard, TrendingUp, Users, AlertTriangle, Ticket, Loader2, ArrowUpRight, ArrowDownRight } from "lucide-react";
import Link from "next/link";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { STATUS_COLORS, PLAN_COLORS, formatNaira } from "@/lib/platform-utils";
import { PlatformGlassCard, AccentGlow, PlatformPageHeader, PlatformSkeleton, StatusChip } from "@/components/platform/platform-mobile-ui";

interface DashboardData {
  statusCounts: { total: number; trial: number; active: number; past_due: number; suspended: number; cancelled: number };
  planCounts: { basic: number; pro: number; enterprise: number; custom: number };
  trialsExpiring: number; newThisMonth: number; totalRevenue: number; totalOutstanding: number; mrr: number;
  monthlyTrend: Array<{ month: string; label: string; revenue: number }>;
  recentTenants: Array<{ id: string; name: string; subscription_status: string; plan: string; created_at: string }>;
  activeCoupons: number; totalCouponUses: number; conversionRate: number;
}

/* ── Animated counter hook ── */
function useCountUp(target: number, duration = 800) {
  const [value, setValue] = useState(0);
  const ref = useRef<number | null>(null);

  useEffect(() => {
    if (target === 0) { setValue(0); return; }
    const start = performance.now();
    const from = 0;
    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (progress < 1) ref.current = requestAnimationFrame(tick);
    }
    ref.current = requestAnimationFrame(tick);
    return () => { if (ref.current) cancelAnimationFrame(ref.current); };
  }, [target, duration]);

  return value;
}

/* ── KPI Card ── */
function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
  format = "number",
  index,
}: {
  label: string;
  value: number;
  sub: string;
  icon: React.ComponentType<Record<string, unknown>>;
  color: string;
  format?: "number" | "currency";
  index: number;
}) {
  const animated = useCountUp(value, 900 + index * 100);
  const display = format === "currency" ? formatNaira(animated) : String(animated);

  return (
    <PlatformGlassCard hover className="platform-card-glow">
      <AccentGlow color={color} />
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-muted-fg)]">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight platform-number-pop" style={{ color }}>
            {display}
          </p>
          <p className="mt-1.5 text-xs text-[var(--color-muted-fg)]">{sub}</p>
        </div>
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${color}15` }}
        >
          <Icon className="h-5 w-5" style={{ color }} />
        </div>
      </div>
    </PlatformGlassCard>
  );
}

/* ── Chart tooltip ── */
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 shadow-xl">
      <p className="text-xs font-medium text-[var(--color-muted-fg)]">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-sky-600">{formatNaira(payload[0].value)}</p>
    </div>
  );
}

export default function PlatformDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/platform/dashboard", { credentials: "include" })
      .then(r => r.json()).then(d => setData(d.data)).catch(() => setError("Failed to load dashboard")).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="space-y-6">
      <div className="h-10 w-56"><PlatformSkeleton className="h-full w-full" /></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0,1,2,3].map(i => <PlatformSkeleton key={i} className="h-28" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <PlatformSkeleton className="h-64 lg:col-span-2" />
        <PlatformSkeleton className="h-64" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <PlatformSkeleton className="h-48" />
        <PlatformSkeleton className="h-48" />
      </div>
    </div>
  );

  if (!data) return (
    <div className="flex flex-col items-center justify-center py-20">
      <AlertTriangle className="mb-3 h-10 w-10 text-amber-500 opacity-60" />
      <p className="text-[var(--color-muted-fg)]">{error || "Failed to load dashboard"}</p>
    </div>
  );

  const chartData = data.monthlyTrend.map(m => ({ name: m.label.split(" ")[0], revenue: m.revenue }));

  return (
    <div className="space-y-6">
      <PlatformPageHeader
        title="Platform Dashboard"
        subtitle="Overview of all hospitals on SkyCare"
      />

      {/* ── KPI Cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total Hospitals"
          value={data.statusCounts.total}
          sub={`${data.newThisMonth} new this month`}
          icon={Building2}
          color="#6366f1"
          index={0}
        />
        <KpiCard
          label="Monthly Recurring Revenue"
          value={data.mrr}
          sub={`${formatNaira(data.totalRevenue)} total collected`}
          icon={TrendingUp}
          color="#10b981"
          format="currency"
          index={1}
        />
        <KpiCard
          label="Active Subscriptions"
          value={data.statusCounts.active}
          sub={`${data.conversionRate}% trial conversion`}
          icon={Users}
          color="#0ea5e9"
          index={2}
        />
        <KpiCard
          label="Outstanding"
          value={data.totalOutstanding}
          sub={`${data.statusCounts.past_due} past due`}
          icon={AlertTriangle}
          color="#f97316"
          format="currency"
          index={3}
        />
      </div>

      {/* ── Chart + Status breakdown ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <PlatformGlassCard className="lg:col-span-2">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--color-muted-fg)]">Revenue Trend</h3>
          <div className="h-56 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--color-muted-fg)" axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-fg)" axisLine={false} tickLine={false} tickFormatter={v => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="revenue" radius={[6, 6, 0, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={i === chartData.length - 1 ? "#0ea5e9" : "#bae6fd"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </PlatformGlassCard>

        <PlatformGlassCard>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--color-muted-fg)]">By Status</h3>
          <div className="space-y-3">
            {Object.entries(data.statusCounts).filter(([k]) => k !== "total").map(([status, count]) => (
              <div key={status} className="flex items-center justify-between">
                <StatusChip status={status} />
                <span className="text-sm font-bold tabular-nums">{count}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 border-t border-[var(--color-border)] pt-4">
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-fg)]">By Plan</h4>
            <div className="space-y-2.5">
              {Object.entries(data.planCounts).map(([plan, count]) => (
                <div key={plan} className="flex items-center justify-between">
                  <StatusChip status={plan} />
                  <span className="text-sm font-bold tabular-nums">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </PlatformGlassCard>
      </div>

      {/* ── Recent + Quick Stats ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <PlatformGlassCard>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted-fg)]">Recent Signups</h3>
            <Link href="/platform/tenants" className="flex items-center gap-1 text-xs font-medium text-sky-600 hover:text-sky-700 transition-colors">
              View all <ArrowUpRight size={12} />
            </Link>
          </div>
          <div className="space-y-2">
            {data.recentTenants.map(t => (
              <div key={t.id} className="flex items-center justify-between rounded-xl bg-[var(--color-muted)]/30 px-3.5 py-2.5 transition-colors hover:bg-[var(--color-muted)]/60">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{t.name}</p>
                  <p className="text-[11px] text-[var(--color-muted-fg)]">{new Date(t.created_at).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <StatusChip status={t.plan} />
                  <StatusChip status={t.subscription_status} />
                </div>
              </div>
            ))}
            {data.recentTenants.length === 0 && (
              <div className="py-8 text-center text-sm text-[var(--color-muted-fg)]">No tenants yet</div>
            )}
          </div>
        </PlatformGlassCard>

        <PlatformGlassCard>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--color-muted-fg)]">Quick Stats</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl bg-amber-50/80 px-4 py-3.5 dark:bg-amber-500/10 transition-colors hover:shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-500/20">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-xs font-medium text-amber-800 dark:text-amber-400">Trials Expiring</p>
                  <p className="text-[10px] text-amber-600/70 dark:text-amber-400/60">Within 7 days</p>
                </div>
              </div>
              <span className="text-xl font-bold text-amber-600 dark:text-amber-400 tabular-nums platform-number-pop">{data.trialsExpiring}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-sky-50/80 px-4 py-3.5 dark:bg-sky-500/10 transition-colors hover:shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 dark:bg-sky-500/20">
                  <Ticket className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                </div>
                <div>
                  <p className="text-xs font-medium text-sky-800 dark:text-sky-400">Active Coupons</p>
                  <p className="text-[10px] text-sky-600/70 dark:text-sky-400/60">Currently live</p>
                </div>
              </div>
              <span className="text-xl font-bold text-sky-600 dark:text-sky-400 tabular-nums platform-number-pop">{data.activeCoupons}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-emerald-50/80 px-4 py-3.5 dark:bg-emerald-500/10 transition-colors hover:shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-500/20">
                  <CreditCard className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs font-medium text-emerald-800 dark:text-emerald-400">Coupon Uses</p>
                  <p className="text-[10px] text-emerald-600/70 dark:text-emerald-400/60">All time</p>
                </div>
              </div>
              <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums platform-number-pop">{data.totalCouponUses}</span>
            </div>
          </div>
        </PlatformGlassCard>
      </div>
    </div>
  );
}
