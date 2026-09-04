"use client";

import { useEffect, useState } from "react";
import {
  RefreshCw, UserCheck, UserX, Clock, Building2, AlertTriangle,
  Loader2, Eye, Shield,
} from "lucide-react";
import { PlatformGlassCard, PlatformPageHeader, StatusChip } from "@/components/platform/platform-mobile-ui";

interface ImpersonationSession {
  id: string; super_admin_id: string; super_admin_email: string;
  tenant_id: string; tenant_name: string; started_at: string;
  expires_at: string; stopped_at: string | null; status: string;
}

interface Tenant {
  id: string; name: string; subscription_status: string;
}

export default function ImpersonationPage() {
  const [sessions, setSessions] = useState<ImpersonationSession[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTenant, setSelectedTenant] = useState("");
  const [starting, setStarting] = useState(false);
  const [activeSession, setActiveSession] = useState<ImpersonationSession | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [sessRes, tenRes] = await Promise.all([
        fetch("/api/platform/impersonate", { credentials: "include" }),
        fetch("/api/platform/tenants", { credentials: "include" }),
      ]);
      const sessJ = await sessRes.json();
      const tenJ = await tenRes.json();
      setSessions(sessJ.data || []);
      setTenants(tenJ.data?.rows || tenJ.data || []);
      // Find active session
      const active = (sessJ.data || []).find((s: ImpersonationSession) => s.status === "active");
      setActiveSession(active || null);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const startImpersonation = async () => {
    if (!selectedTenant) return;
    setStarting(true);
    try {
      const res = await fetch("/api/platform/impersonate", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: selectedTenant }),
      });
      const j = await res.json();
      if (j.data?.token) {
        alert(`Impersonation started!\n\nTenant: ${j.data.tenant_name}\nExpires: ${j.data.expires_in}\n\nToken: ${j.data.token.slice(0, 20)}…\n\nUse this token to access the tenant's dashboard.`);
      }
      setSelectedTenant("");
      load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed";
      alert(msg);
    }
    setStarting(false);
  };

  const stopImpersonation = async (sessionId: string) => {
    try {
      await fetch("/api/platform/impersonate/stop", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
      load();
    } catch {}
  };

  const fmtDate = (s: string) => new Date(s).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-6 platform-stagger">
      <PlatformPageHeader title="Tenant Impersonation" subtitle="Temporarily access a tenant&apos;s dashboard for support">
        <button onClick={load} className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm hover:bg-[var(--color-muted)] platform-btn-gradient">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </PlatformPageHeader>

      {/* Warning */}
      <PlatformGlassCard className="p-4 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
        <div className="text-sm text-amber-700 dark:text-amber-400">
          <p className="font-semibold">Impersonation sessions are limited to 5 minutes</p>
          <p className="mt-1">All actions during impersonation are audit-logged. The tenant&apos;s admin will see the impersonation in their audit trail.</p>
        </div>
      </PlatformGlassCard>

      {/* Active session */}
      {activeSession && (
        <PlatformGlassCard className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-sky-100 dark:bg-sky-900/30">
                <Eye className="h-5 w-5 text-sky-600" />
              </div>
              <div>
                <p className="font-semibold text-sky-800 dark:text-sky-300">Active Impersonation</p>
                <p className="text-sm text-sky-600 dark:text-sky-400">
                  Impersonating: <strong>{activeSession.tenant_name}</strong> · Expires: {fmtDate(activeSession.expires_at)}
                </p>
              </div>
            </div>
            <button onClick={() => stopImpersonation(activeSession.id)}
              className="flex items-center gap-1 rounded-lg bg-red-500 px-3 py-2 text-sm text-white hover:bg-red-600">
              <UserX className="h-4 w-4" /> Stop
            </button>
          </div>
        </PlatformGlassCard>
      )}

      {/* Start new */}
      <PlatformGlassCard className="p-5">
        <h3 className="text-sm font-semibold mb-3">Start Impersonation</h3>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="text-xs text-[var(--color-muted-fg)] mb-1 block">Select Tenant</label>
            <select className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              value={selectedTenant} onChange={e => setSelectedTenant(e.target.value)}>
              <option value="">Choose a hospital…</option>
              {tenants.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.subscription_status})</option>
              ))}
            </select>
          </div>
          <button onClick={startImpersonation} disabled={!selectedTenant || starting || !!activeSession}
            className="flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm text-white hover:bg-sky-600 disabled:opacity-50 platform-btn-gradient">
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
            Impersonate
          </button>
        </div>
      </PlatformGlassCard>

      {/* History */}
      <PlatformGlassCard className="overflow-x-auto">
        <div className="px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-muted)]/30">
          <h3 className="text-sm font-semibold">Session History</h3>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-[var(--color-muted-fg)]">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-[var(--color-muted-fg)] text-center py-12">No impersonation sessions yet</p>
        ) : (
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-xs">
                <th className="px-4 py-2 font-medium">Admin</th>
                <th className="px-4 py-2 font-medium">Tenant</th>
                <th className="px-4 py-2 font-medium">Started</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => (
                <tr key={s.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-muted)]/20 platform-table-row">
                  <td className="px-4 py-2 text-[var(--color-muted-fg)]">{s.super_admin_email}</td>
                  <td className="px-4 py-2 flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5 text-[var(--color-muted-fg)]" />
                    {s.tenant_name || s.tenant_id.slice(0, 8) + "…"}
                  </td>
                  <td className="px-4 py-2 text-xs text-[var(--color-muted-fg)]">{fmtDate(s.started_at)}</td>
                  <td className="px-4 py-2">
                    <StatusChip status={s.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PlatformGlassCard>
    </div>
  );
}
