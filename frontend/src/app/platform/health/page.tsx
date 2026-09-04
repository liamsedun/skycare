"use client";

import { useEffect, useState } from "react";
import {
  RefreshCw, CheckCircle2, AlertTriangle, Users, Building2,
  HardDrive, Database, Server, Shield, Zap, Activity, Loader2,
} from "lucide-react";
import { PlatformGlassCard, PlatformPageHeader } from "@/components/platform/platform-mobile-ui";

interface HealthData {
  uptime: number;
  appServer: string;
  dbStatus: string;
  cacheStatus: string;
  kpis: {
    activeUsers: number; totalUsers: number; newTenantsToday: number;
    totalTenants: number; storageUsedBytes: number; dbSize: number;
    openIssues: number; totalTickets: number;
    activeAnnouncements: number; activeRollouts: number; totalRollouts: number;
  };
  server: {
    uptime: number; memoryUsed: number; memoryTotal: number; memoryRss: number;
    nodeVersion: string; platform: string; arch: string;
  };
  services: Array<{ name: string; status: string; icon: string }>;
}

const formatBytes = (b: number) => {
  if (b >= 1073741824) return (b / 1073741824).toFixed(1) + " GB";
  if (b >= 1048576) return (b / 1048576).toFixed(1) + " MB";
  if (b >= 1024) return (b / 1024).toFixed(1) + " KB";
  return b + " B";
};

const SERVICE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  server: Server, database: Database, shield: Shield, "hard-drive": HardDrive, zap: Zap,
};

export default function SystemHealthPage() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/platform/system-health", { credentials: "include" });
      const j = await res.json();
      setData(j.data);
    } catch { setData(null); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-[var(--color-muted-fg)]">
      <Loader2 className="h-6 w-6 animate-spin mr-2" /> Checking system health…
    </div>
  );

  if (!data) return <div className="text-center py-20 text-[var(--color-muted-fg)]">Failed to load health data</div>;

  const { kpis, server, services } = data;
  const memPct = server.memoryTotal > 0 ? (server.memoryUsed / server.memoryTotal * 100) : 0;

  const kpiCards = [
    { label: "Uptime", value: `${Math.floor(server.uptime / 3600)}h ${Math.floor((server.uptime % 3600) / 60)}m`, icon: CheckCircle2, color: "emerald" },
    { label: "Active Users", value: kpis.activeUsers, icon: Users, color: "blue" },
    { label: "Total Tenants", value: kpis.totalTenants, icon: Building2, color: "indigo" },
    { label: "Storage Used", value: formatBytes(kpis.storageUsedBytes), icon: HardDrive, color: "amber" },
  ];

  const colorMap: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
    blue: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
    indigo: "bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400",
    amber: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
  };

  return (
    <div className="space-y-6 platform-stagger">
      <PlatformPageHeader title="System Health" subtitle="Platform infrastructure status">
        <button onClick={load} className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm hover:bg-[var(--color-muted)] platform-btn-gradient">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </PlatformPageHeader>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpiCards.map((c, i) => (
          <PlatformGlassCard key={i} hover className="p-4 flex items-start gap-3">
            <div className={`p-2 rounded-lg ${colorMap[c.color]}`}>
              <c.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-[var(--color-muted-fg)]">{c.label}</p>
              <p className="text-lg font-bold mt-0.5">{c.value}</p>
            </div>
          </PlatformGlassCard>
        ))}
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PlatformGlassCard className="p-5">
          <h3 className="text-sm font-semibold mb-2">New Tenants Today</h3>
          <p className="text-3xl font-bold">{kpis.newTenantsToday}</p>
          <div className="mt-3 h-2 bg-[var(--color-muted)] rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(kpis.newTenantsToday * 10, 100)}%` }} />
          </div>
        </PlatformGlassCard>
        <PlatformGlassCard className="p-5">
          <h3 className="text-sm font-semibold mb-2">Memory Usage</h3>
          <p className="text-3xl font-bold">{memPct.toFixed(0)}%</p>
          <div className="mt-3 h-2 bg-[var(--color-muted)] rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${memPct > 80 ? "bg-red-500" : memPct > 60 ? "bg-amber-500" : "bg-emerald-500"}`}
              style={{ width: `${memPct}%` }} />
          </div>
          <p className="text-xs text-[var(--color-muted-fg)] mt-1">{formatBytes(server.memoryUsed)} / {formatBytes(server.memoryTotal)}</p>
        </PlatformGlassCard>
      </div>

      {/* Service Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {services.map((s, i) => {
          const Icon = SERVICE_ICONS[s.icon] || Server;
          return (
            <PlatformGlassCard key={i} className="p-4 flex items-center gap-3">
              <Icon className="h-5 w-5 text-[var(--color-muted-fg)]" />
              <div className="flex-1">
                <p className="text-sm font-medium">{s.name}</p>
              </div>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                s.status === "healthy" || s.status === "connected" || s.status === "operational"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                  : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
              }`}>
                <CheckCircle2 className="h-3 w-3" /> {s.status}
              </span>
            </PlatformGlassCard>
          );
        })}
      </div>

      {/* Warning */}
      {kpis.openIssues > 0 && (
        <PlatformGlassCard className="p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <p className="text-sm text-amber-700 dark:text-amber-400">
            {kpis.openIssues} open support issue(s) require attention
          </p>
        </PlatformGlassCard>
      )}

      {/* System Info */}
      <PlatformGlassCard className="p-5">
        <h3 className="text-sm font-semibold mb-3">System Information</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          {[
            { label: "Node.js", value: server.nodeVersion },
            { label: "Platform", value: server.platform },
            { label: "Architecture", value: server.arch },
            { label: "RSS Memory", value: formatBytes(server.memoryRss) },
            { label: "DB Size", value: kpis.dbSize > 0 ? formatBytes(kpis.dbSize) : "N/A" },
            { label: "Active Features", value: `${kpis.activeRollouts} / ${kpis.totalRollouts}` },
            { label: "Announcements", value: kpis.activeAnnouncements },
            { label: "Total Tickets", value: kpis.totalTickets },
          ].map((s, i) => (
            <div key={i}>
              <p className="text-[var(--color-muted-fg)]">{s.label}</p>
              <p className="font-medium mt-0.5">{s.value}</p>
            </div>
          ))}
        </div>
      </PlatformGlassCard>
    </div>
  );
}
