"use client";

import { useEffect, useState } from "react";
import {
  RefreshCw, Plus, Key, Copy, Loader2, Check, AlertTriangle, Building2,
} from "lucide-react";
import PlatformModal from "@/components/platform/platform-modal";
import { PlatformPageHeader, StatusChip, PlatformEmpty, PlatformGlassCard } from "@/components/platform/platform-mobile-ui";

interface ApiKey {
  id: string; name: string; prefix: string; scopes: string[];
  last_used_at: string | null; expires_at: string | null;
  is_active: boolean; created_at: string; tenant_id?: string;
  key?: string;
}

interface Tenant { id: string; name: string; }

const SCOPE_OPTIONS = ["read", "write", "billing", "patients", "appointments", "prescriptions", "lab"];

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", scopes: ["read"] as string[], expires_at: "", tenant_id: "" });
  const [submitting, setSubmitting] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [keysRes, tenRes] = await Promise.all([
        fetch("/api/platform/api-keys", { credentials: "include" }),
        fetch("/api/platform/tenants", { credentials: "include" }),
      ]);
      const keysJ = await keysRes.json();
      const tenJ = await tenRes.json();
      setKeys(keysJ.data || []);
      setTenants(tenJ.data?.rows || tenJ.data || []);
    } catch { setKeys([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/platform/api-keys", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          scopes: form.scopes,
          expires_at: form.expires_at || undefined,
          tenant_id: form.tenant_id || undefined,
        }),
      });
      const j = await res.json();
      if (j.data?.key) {
        setNewKey(j.data.key);
      }
      setShowCreate(false);
      setForm({ name: "", scopes: ["read"], expires_at: "", tenant_id: "" });
      load();
    } catch {}
    setSubmitting(false);
  };

  const revoke = async (id: string) => {
    if (!confirm("Revoke this API key? This cannot be undone.")) return;
    await fetch(`/api/platform/api-keys?id=${id}`, { method: "DELETE", credentials: "include" });
    load();
  };

  const copyKey = () => {
    if (!newKey) return;
    navigator.clipboard.writeText(newKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "Never";
  const toggleScope = (scope: string) => {
    setForm(f => ({
      ...f,
      scopes: f.scopes.includes(scope) ? f.scopes.filter(s => s !== scope) : [...f.scopes, scope],
    }));
  };

  const tenantName = (tid?: string) => tenants.find(t => t.id === tid)?.name || tid?.slice(0, 8) + "…" || "—";

  return (
    <div className="space-y-6 platform-stagger">
      <PlatformPageHeader title="API Keys" subtitle="Manage programmatic access keys for tenant integrations">
        <button onClick={load} className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm hover:bg-[var(--color-muted)]">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-1 rounded-lg bg-sky-500 px-3 py-2 text-sm text-white hover:bg-sky-600 platform-btn-gradient">
          <Plus className="h-4 w-4" /> Create Key
        </button>
      </PlatformPageHeader>

      {/* New key display */}
      {newKey && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-amber-700 dark:text-amber-400">API Key Created — Copy it now!</p>
              <p className="text-sm text-amber-600 dark:text-amber-500 mt-1">This is the only time you will see the full key. Store it securely.</p>
              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 rounded-lg bg-white dark:bg-gray-900 border border-amber-300 px-3 py-2 text-sm font-mono break-all">{newKey}</code>
                <button onClick={copyKey} className="rounded-lg bg-amber-500 px-3 py-2 text-white hover:bg-amber-600">
                  {copiedKey ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Keys table */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-[var(--color-muted-fg)]">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading…
        </div>
      ) : keys.length === 0 ? (
        <PlatformEmpty icon={<Key className="h-7 w-7" />} title="No API keys yet" hint="Create one to get started." />
      ) : (
        <PlatformGlassCard className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-muted)]/30 text-left">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Key</th>
                <th className="px-4 py-3 font-medium">Tenant</th>
                <th className="px-4 py-3 font-medium">Scopes</th>
                <th className="px-4 py-3 font-medium">Last Used</th>
                <th className="px-4 py-3 font-medium">Expires</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {keys.map(k => (
                <tr key={k.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-muted)]/20 platform-table-row">
                  <td className="px-4 py-3 font-medium">{k.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-[var(--color-muted-fg)]">{k.prefix}…</td>
                  <td className="px-4 py-3 text-xs text-[var(--color-muted-fg)] flex items-center gap-1">
                    <Building2 className="h-3 w-3" /> {tenantName(k.tenant_id)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {k.scopes?.map(s => (
                        <span key={s} className="rounded bg-[var(--color-muted)] px-1.5 py-0.5 text-[10px] font-medium">{s}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--color-muted-fg)]">{k.last_used_at ? fmtDate(k.last_used_at) : "Never"}</td>
                  <td className="px-4 py-3 text-xs text-[var(--color-muted-fg)]">{fmtDate(k.expires_at)}</td>
                  <td className="px-4 py-3">
                    <StatusChip status={k.is_active ? "active" : "inactive"} label={k.is_active ? "Active" : "Revoked"} />
                  </td>
                  <td className="px-4 py-3">
                    {k.is_active && (
                      <button onClick={() => revoke(k.id)} className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded px-2 py-0.5 text-xs">Revoke</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </PlatformGlassCard>
      )}

      <PlatformModal open={showCreate} onClose={() => setShowCreate(false)} maxWidth="max-w-md">
            <h2 className="text-lg font-semibold mb-4">Create API Key</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-[var(--color-muted-fg)] mb-1 block">Tenant</label>
                <select className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                  value={form.tenant_id} onChange={e => setForm({ ...form, tenant_id: e.target.value })}>
                  <option value="">Select a hospital…</option>
                  {tenants.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-[var(--color-muted-fg)] mb-1 block">Name</label>
                <input className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                  placeholder="Stripe Integration" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-[var(--color-muted-fg)] mb-1 block">Scopes</label>
                <div className="flex flex-wrap gap-2">
                  {SCOPE_OPTIONS.map(s => (
                    <button key={s} onClick={() => toggleScope(s)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
                        form.scopes.includes(s)
                          ? "bg-sky-500 text-white border-sky-500"
                          : "bg-[var(--color-background)] text-[var(--color-muted-fg)] border-[var(--color-border)] hover:bg-[var(--color-muted)]"
                      }`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-[var(--color-muted-fg)] mb-1 block">Expires (optional)</label>
                <input type="date" className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                  value={form.expires_at} onChange={e => setForm({ ...form, expires_at: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowCreate(false)} className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm hover:bg-[var(--color-muted)]">Cancel</button>
              <button onClick={create} disabled={!form.name || form.scopes.length === 0 || submitting}
                className="flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm text-white hover:bg-sky-600 disabled:opacity-50 platform-btn-gradient">
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Create
              </button>
            </div>
      </PlatformModal>
    </div>
  );
}
