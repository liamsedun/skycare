"use client";

import { useEffect, useState } from "react";
import {
  RefreshCw, TrendingUp, TrendingDown, Building2, Users, CreditCard,
  AlertTriangle, BarChart3, Loader2, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";
import { formatNaira, fmtCompact } from "@/lib/platform-utils";
import { PlatformGlassCard, PlatformPageHeader } from "@/components/platform/platform-mobile-ui";

const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

interface AnalyticsData {
  kpis: {
    totalTenants: number; activeTenants: number; trialTenants: number;
    cancelledTenants: number; suspendedTenants: number; mrr: number; arr: number;
    totalRevenue: number; totalUsers: number; activeUsers: number;
    openTickets: number; totalTickets: number;
  };
  revenueOverTime: Array<{ month: string; revenue: number; subscriptions: number }>;
  planDistribution: Array<{ planName: string; count: number; revenue: number }>;
  orgGrowth: Array<{ month: string; newOrgs: number }>;
  ticketStats: { open: number; in_progress: number; resolved: number; closed: number };
  featureUsage: Array<{ featureKey: string; name: string; isActive: boolean; rolloutPercent: number }>;
  serverStatus: { uptime: number; memoryUsed: number; memoryTotal: number; nodeVersion: string };
}

export default function SaasAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/platform/saas-analytics", { credentials: "include" });
      const j = await res.json();
      setData(j.data);
    } catch { setData(null); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-[var(--color-muted-fg)]">
      <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading analytics…
    </div>
  );

  if (!data) return <div className="text-center py-20 text-[var(--color-muted-fg)]">Failed to load analytics</div>;

  const { kpis } = data;
  const kpiCards = [
    { label: "MRR", value: formatNaira(kpis.mrr), icon: CreditCard, color: "indigo", sub: "Monthly Recurring Revenue" },
    { label: "ARR", value: formatNaira(kpis.arr), icon: TrendingUp, color: "emerald", sub: "Annual Recurring Revenue" },
    { label: "Active Tenants", value: kpis.activeTenants, icon: Building2, color: "blue", sub: `${kpis.totalTenants} total` },
    { label: "Trial Tenants", value: kpis.trialTenants, icon: Users, color: "amber", sub: "On free trial" },
    { label: "Total Revenue", value: formatNaira(kpis.totalRevenue), icon: CreditCard, color: "emerald", sub: "All time" },
    { label: "Total Users", value: kpis.totalUsers, icon: Users, color: "blue", sub: `${kpis.activeUsers} active` },
    { label: "Open Tickets", value: kpis.openTickets, icon: AlertTriangle, color: kpis.openTickets > 0 ? "red" : "emerald", sub: `${kpis.totalTickets} total` },
    { label: "Cancelled", value: kpis.cancelledTenants, icon: TrendingDown, color: "red", sub: `${kpis.suspendedTenants} suspended` },
  ];

  const colorMap: Record<string, string> = {
    indigo: "bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
    blue: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
    amber: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
    red: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  };

  return (
    <div className="space-y-6 platform-stagger">
      <PlatformPageHeader title="SaaS Analytics" subtitle="Platform-wide metrics and insights">
        <button onClick={load} className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm hover:bg-[var(--color-muted)] platform-btn-gradient">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </PlatformPageHeader>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpiCards.map((c, i) => (
          <PlatformGlassCard key={i} hover className="p-4 flex items-start gap-3">
            <div className={`p-2 rounded-lg ${colorMap[c.color]}`}>
              <c.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-[var(--color-muted-fg)]">{c.label}</p>
              <p className="text-lg font-bold mt-0.5">{c.value}</p>
              <p className="text-xs text-[var(--color-muted-fg)] mt-0.5">{c.sub}</p>
            </div>
          </PlatformGlassCard>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Trend */}
        <PlatformGlassCard className="p-5">
          <h3 className="text-sm font-semibold mb-4">Revenue Trend (6 months)</h3>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={data.revenueOverTime}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--color-border)", fontSize: 13 }} />
              <Area type="monotone" dataKey="revenue" stroke="#6366f1" fill="url(#revGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </PlatformGlassCard>

        {/* Org Growth */}
        <PlatformGlassCard className="p-5">
          <h3 className="text-sm font-semibold mb-4">Tenant Growth (12 months)</h3>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={data.orgGrowth}>
              <defs>
                <linearGradient id="orgGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--color-border)", fontSize: 13 }} />
              <Area type="monotone" dataKey="newOrgs" stroke="#10b981" fill="url(#orgGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </PlatformGlassCard>
      </div>

      {/* Middle Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Plan Distribution */}
        <PlatformGlassCard className="p-5">
          <h3 className="text-sm font-semibold mb-4">Plan Distribution</h3>
          {data.planDistribution.length === 0 ? (
            <p className="text-sm text-[var(--color-muted-fg)] text-center py-8">No data</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={data.planDistribution} dataKey="count" nameKey="planName" cx="50%" cy="50%" outerRadius={70}>
                  {data.planDistribution.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--color-border)", fontSize: 13 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
          <div className="flex flex-wrap gap-2 mt-2">
            {data.planDistribution.map((p, i) => (
              <span key={i} className="flex items-center gap-1 text-xs">
                <span className="h-2 w-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                {p.planName} ({p.count})
              </span>
            ))}
          </div>
        </PlatformGlassCard>

        {/* Ticket Stats */}
        <PlatformGlassCard className="p-5">
          <h3 className="text-sm font-semibold mb-4">Support Tickets</h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Open", value: data.ticketStats.open, color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
              { label: "In Progress", value: data.ticketStats.in_progress, color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
              { label: "Resolved", value: data.ticketStats.resolved, color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
              { label: "Closed", value: data.ticketStats.closed, color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
            ].map((s, i) => (
              <div key={i} className={`rounded-lg p-3 text-center ${s.color}`}>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </PlatformGlassCard>

        {/* Server Status */}
        <PlatformGlassCard className="p-5">
          <h3 className="text-sm font-semibold mb-4">Platform Health</h3>
          <div className="space-y-3">
            {[
              { label: "Uptime", value: `${Math.floor(data.serverStatus.uptime / 3600)}h ${Math.floor((data.serverStatus.uptime % 3600) / 60)}m` },
              { label: "Node.js", value: data.serverStatus.nodeVersion },
              { label: "Memory Used", value: `${(data.serverStatus.memoryUsed / 1024 / 1024).toFixed(0)} MB` },
              { label: "Memory Total", value: `${(data.serverStatus.memoryTotal / 1024 / 1024).toFixed(0)} MB` },
            ].map((s, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-[var(--color-muted-fg)]">{s.label}</span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  {s.value}
                </span>
              </div>
            ))}
          </div>
        </PlatformGlassCard>
      </div>

      {/* Feature Rollouts */}
      {data.featureUsage.length > 0 && (
        <PlatformGlassCard className="p-5">
          <h3 className="text-sm font-semibold mb-4">Feature Rollouts</h3>
          <div className="space-y-2">
            {data.featureUsage.map((f, i) => (
              <div key={i} className="flex items-center justify-between text-sm rounded-lg bg-[var(--color-muted)]/30 p-3">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${f.isActive ? "bg-emerald-500" : "bg-gray-400"}`} />
                  <span className="font-medium">{f.name}</span>
                  <code className="text-xs text-[var(--color-muted-fg)] font-mono">{f.featureKey}</code>
                </div>
                <span className="text-[var(--color-muted-fg)]">{f.rolloutPercent}%</span>
              </div>
            ))}
          </div>
        </PlatformGlassCard>
      )}
    </div>
  );
}
