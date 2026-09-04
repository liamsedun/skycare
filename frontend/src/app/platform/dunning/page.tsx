"use client";

import { useEffect, useState } from "react";
import {
  RefreshCw, Play, AlertTriangle, Clock, Building2,
  Loader2, CheckCircle2, XCircle, ArrowRight,
} from "lucide-react";
import { PlatformGlassCard, PlatformPageHeader, StatusChip } from "@/components/platform/platform-mobile-ui";

interface DunningRun {
  id: string; tenant_id: string; stage: string; executed_at: string;
  notified_at: string | null; response: string | null;
  metadata: Record<string, unknown>; tenant?: { name: string } | null;
}

interface PipelineResult {
  warned: number; suspended: number; archived: number; total: number;
}

const STAGE_COLORS: Record<string, string> = {
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-800 dark:text-amber-300",
  suspended: "bg-orange-100 text-orange-700 dark:bg-orange-800 dark:text-orange-300",
  archived: "bg-red-100 text-red-700 dark:bg-red-800 dark:text-red-300",
};

export default function DunningPage() {
  const [runs, setRuns] = useState<DunningRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [lastResult, setLastResult] = useState<PipelineResult | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/platform/dunning", { credentials: "include" });
      const j = await res.json();
      setRuns(j.data || []);
    } catch { setRuns([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const executePipeline = async () => {
    if (!confirm("Run the dunning pipeline? This will escalate overdue subscriptions.")) return;
    setExecuting(true);
    try {
      const res = await fetch("/api/platform/dunning", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const j = await res.json();
      setLastResult(j.data);
      load();
    } catch {}
    setExecuting(false);
  };

  const fmtDate = (s: string) => new Date(s).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-6 platform-stagger">
      <PlatformPageHeader title="Dunning Pipeline" subtitle="Automated subscription payment recovery">
        <div className="flex items-center gap-2">
          <button onClick={load} className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm hover:bg-[var(--color-muted)]">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button onClick={executePipeline} disabled={executing}
            className="flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-2 text-sm text-white hover:bg-amber-600 disabled:opacity-50 platform-btn-gradient">
            {executing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Run Pipeline
          </button>
        </div>
      </PlatformPageHeader>

      {/* Pipeline stages */}
      <PlatformGlassCard className="p-5">
        <h3 className="text-sm font-semibold mb-4">Pipeline Stages</h3>
        <div className="flex items-center gap-3">
          {[
            { stage: "Warning", desc: "Email reminder sent", bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-600", icon: AlertTriangle },
            { stage: "Suspended", desc: "Subscription suspended", bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-600", icon: Clock },
            { stage: "Archived", desc: "Subscription cancelled", bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-600", icon: XCircle },
          ].map((s, i) => (
            <div key={i} className="flex items-center gap-3 flex-1">
              <div className={`rounded-lg p-2 ${s.bg}`}>
                <s.icon className={`h-5 w-5 ${s.text}`} />
              </div>
              <div>
                <p className="text-sm font-medium">{s.stage}</p>
                <p className="text-xs text-[var(--color-muted-fg)]">{s.desc}</p>
              </div>
              {i < 2 && <ArrowRight className="h-4 w-4 text-[var(--color-muted-fg)] ml-2" />}
            </div>
          ))}
        </div>
      </PlatformGlassCard>

      {/* Last result */}
      {lastResult && (
        <PlatformGlassCard className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">Pipeline executed</span>
          </div>
          <div className="flex gap-4 text-sm text-emerald-600 dark:text-emerald-400">
            <span>{lastResult.total} overdue tenant(s) found</span>
            <span>•</span>
            <span>{lastResult.warned} warned</span>
            <span>{lastResult.suspended} suspended</span>
            <span>{lastResult.archived} archived</span>
          </div>
        </PlatformGlassCard>
      )}

      {/* Runs table */}
      <PlatformGlassCard className="overflow-x-auto">
        <div className="px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-muted)]/30">
          <h3 className="text-sm font-semibold">Dunning History</h3>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-[var(--color-muted-fg)]">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
          </div>
        ) : runs.length === 0 ? (
          <p className="text-sm text-[var(--color-muted-fg)] text-center py-12">No dunning runs yet. Click &quot;Run Pipeline&quot; to start.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-xs">
                <th className="px-4 py-2 font-medium">Tenant</th>
                <th className="px-4 py-2 font-medium">Stage</th>
                <th className="px-4 py-2 font-medium">Executed</th>
                <th className="px-4 py-2 font-medium">Notified</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(r => (
                <tr key={r.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-muted)]/20 platform-table-row">
                  <td className="px-4 py-2 flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5 text-[var(--color-muted-fg)]" />
                    {r.tenant?.name || r.metadata?.tenant_name as string || r.tenant_id.slice(0, 8) + "…"}
                  </td>
                  <td className="px-4 py-2">
                    <StatusChip status={r.stage} />
                  </td>
                  <td className="px-4 py-2 text-xs text-[var(--color-muted-fg)]">{fmtDate(r.executed_at)}</td>
                  <td className="px-4 py-2 text-xs text-[var(--color-muted-fg)]">{r.notified_at ? fmtDate(r.notified_at) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PlatformGlassCard>
    </div>
  );
}
