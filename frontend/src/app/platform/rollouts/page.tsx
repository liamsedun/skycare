"use client";

import { useEffect, useState } from "react";
import {
  Plus, RefreshCw, FlaskConical, Percent, Calendar, Building2,
  Pencil, History, Loader2, X, ToggleLeft, ToggleRight,
} from "lucide-react";
import { PlatformGlassCard, PlatformPageHeader, StatusChip, PlatformEmpty, PlatformSheet } from "@/components/platform/platform-mobile-ui";

interface Rollout {
  id: string; feature_key: string; name: string; description: string | null;
  rollout_percent: number; is_active: boolean; allowlist_tenant_ids: string[];
  started_at: string | null; ended_at: string | null; created_by: string | null;
  created_at: string; updated_at: string;
}

interface RolloutEvent {
  id: string; rollout_id: string; tenant_id: string; event: string;
  metadata: Record<string, unknown>; created_at: string;
}

export default function FeatureRolloutsPage() {
  const [rollouts, setRollouts] = useState<Rollout[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState<"create" | "edit" | null>(null);
  const [editingRollout, setEditingRollout] = useState<Rollout | null>(null);
  const [form, setForm] = useState({
    feature_key: "", name: "", description: "", rollout_percent: 0,
    is_active: false, allowlist_tenant_ids: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [showEvents, setShowEvents] = useState<string | null>(null);
  const [events, setEvents] = useState<RolloutEvent[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/platform/feature-rollouts", { credentials: "include" });
      const j = await res.json();
      setRollouts(j.data || []);
    } catch { setRollouts([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditingRollout(null);
    setForm({ feature_key: "", name: "", description: "", rollout_percent: 0, is_active: false, allowlist_tenant_ids: "" });
    setShowModal("create");
  };

  const openEdit = (r: Rollout) => {
    setEditingRollout(r);
    setForm({
      feature_key: r.feature_key, name: r.name, description: r.description || "",
      rollout_percent: r.rollout_percent, is_active: r.is_active,
      allowlist_tenant_ids: r.allowlist_tenant_ids?.join(", ") || "",
    });
    setShowModal("edit");
  };

  const loadEvents = async (rolloutId: string) => {
    const res = await fetch(`/api/platform/feature-rollouts/${rolloutId}/events`, { credentials: "include" });
    const j = await res.json();
    setEvents(j.data || []);
    setShowEvents(rolloutId);
  };

  const submit = async () => {
    setSubmitting(true);
    const allowlist = form.allowlist_tenant_ids.split(",").map(s => s.trim()).filter(Boolean);
    try {
      if (showModal === "create") {
        await fetch("/api/platform/feature-rollouts", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            feature_key: form.feature_key, name: form.name, description: form.description || null,
            rollout_percent: form.rollout_percent, is_active: form.is_active,
            allowlist_tenant_ids: allowlist,
          }),
        });
      } else {
        await fetch("/api/platform/feature-rollouts", {
          method: "PUT", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingRollout?.id, name: form.name, description: form.description || null,
            rollout_percent: form.rollout_percent, is_active: form.is_active,
            allowlist_tenant_ids: allowlist,
          }),
        });
      }
      setShowModal(null);
      load();
    } catch {}
    setSubmitting(false);
  };

  const toggleActive = async (r: Rollout) => {
    await fetch("/api/platform/feature-rollouts", {
      method: "PUT", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id, is_active: !r.is_active }),
    });
    load();
  };

  const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  return (
    <div className="space-y-6 platform-stagger">
      <PlatformPageHeader title="Feature Rollouts" subtitle="Control feature flags and gradual rollouts">
        <button onClick={load} className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm hover:bg-[var(--color-muted)]">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
        <button onClick={openCreate} className="flex items-center gap-1 rounded-lg bg-sky-500 px-3 py-2 text-sm text-white hover:bg-sky-600 platform-btn-gradient">
          <Plus className="h-4 w-4" /> New Rollout
        </button>
      </PlatformPageHeader>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-[var(--color-muted-fg)]">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading…
        </div>
      ) : rollouts.length === 0 ? (
        <PlatformEmpty
          icon={<FlaskConical className="h-6 w-6" />}
          title="No feature rollouts configured"
          hint="Create a rollout to gradually enable features for tenants"
        />
      ) : (
        <div className="space-y-3">
          {rollouts.map(r => (
            <PlatformGlassCard key={r.id}>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{r.name}</h3>
                    <code className="rounded bg-[var(--color-muted)] px-1.5 py-0.5 text-xs font-mono">{r.feature_key}</code>
                    <StatusChip status={r.is_active ? "active" : "inactive"} />
                  </div>
                  {r.description && <p className="text-sm text-[var(--color-muted-fg)] mt-1">{r.description}</p>}
                  <div className="flex items-center gap-4 mt-2 text-xs text-[var(--color-muted-fg)]">
                    <span className="flex items-center gap-1"><Percent className="h-3 w-3" /> {r.rollout_percent}%</span>
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Started {fmtDate(r.started_at)}</span>
                    {r.ended_at && <span className="flex items-center gap-1">Ended {fmtDate(r.ended_at)}</span>}
                    {r.allowlist_tenant_ids?.length > 0 && (
                      <span className="flex items-center gap-1"><Building2 className="h-3 w-3" /> {r.allowlist_tenant_ids.length} allowlisted</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => toggleActive(r)} className="rounded-lg p-1.5 text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)]" title={r.is_active ? "Deactivate" : "Activate"}>
                    {r.is_active ? <ToggleRight className="h-5 w-5 text-emerald-500" /> : <ToggleLeft className="h-5 w-5" />}
                  </button>
                  <button onClick={() => loadEvents(r.id)} className="rounded-lg p-1.5 text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)]" title="History">
                    <History className="h-4 w-4" />
                  </button>
                  <button onClick={() => openEdit(r)} className="rounded-lg p-1.5 text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)]" title="Edit">
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </PlatformGlassCard>
          ))}
        </div>
      )}

      <PlatformSheet open={!!showModal} onClose={() => setShowModal(null)} title={showModal === "create" ? "New Rollout" : "Edit Rollout"}>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-[var(--color-muted-fg)] mb-1 block">Feature Key</label>
            <input className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm font-mono focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition-all"
              placeholder="new_dashboard_v2" value={form.feature_key}
              onChange={e => setForm({ ...form, feature_key: e.target.value })}
              disabled={showModal === "edit"} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted-fg)] mb-1 block">Name</label>
            <input className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition-all"
              placeholder="New Dashboard" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted-fg)] mb-1 block">Description</label>
            <textarea className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm min-h-[60px] focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition-all"
              placeholder="What does this feature do?" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted-fg)] mb-1 block">Rollout Percentage: {form.rollout_percent}%</label>
            <input type="range" min="0" max="100" value={form.rollout_percent}
              onChange={e => setForm({ ...form, rollout_percent: Number(e.target.value) })}
              className="w-full accent-sky-500" />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted-fg)] mb-1 block">Allowlisted Tenant IDs (comma-separated)</label>
            <input className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm font-mono focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition-all"
              placeholder="uuid-1, uuid-2" value={form.allowlist_tenant_ids}
              onChange={e => setForm({ ...form, allowlist_tenant_ids: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 accent-emerald-500" />
            Active
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={() => setShowModal(null)} className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm hover:bg-[var(--color-muted)]">Cancel</button>
          <button onClick={submit} disabled={!form.feature_key || !form.name || submitting}
            className="flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm text-white hover:bg-sky-600 disabled:opacity-50 platform-btn-gradient">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />} {showModal === "create" ? "Create Rollout" : "Update Rollout"}
          </button>
        </div>
      </PlatformSheet>

      <PlatformSheet open={!!showEvents} onClose={() => setShowEvents(null)} title="Rollout History">
        <div className="max-h-[60vh] overflow-y-auto">
          {events.length === 0 ? (
            <p className="text-sm text-[var(--color-muted-fg)] py-8 text-center">No events recorded</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left">
                  <th className="px-3 py-2 font-medium">Event</th>
                  <th className="px-3 py-2 font-medium">Tenant</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {events.map(e => (
                  <tr key={e.id} className="border-b border-[var(--color-border)] platform-table-row">
                    <td className="px-3 py-2">{e.event}</td>
                    <td className="px-3 py-2 font-mono text-xs">{e.tenant_id.slice(0, 8)}…</td>
                    <td className="px-3 py-2 text-xs text-[var(--color-muted-fg)]">{fmtDate(e.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </PlatformSheet>
    </div>
  );
}
